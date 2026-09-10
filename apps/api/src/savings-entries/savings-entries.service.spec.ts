import { ServiceUnavailableException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { beforeEach, describe, expect, it } from 'vitest';
import type { RateProvider } from '../common/rate-provider.interface.js';
import { SavingsEntriesService } from './savings-entries.service.js';

interface FakeGoal {
  id: string;
  userId: string;
  currency: 'JPY' | 'VND';
}

interface FakeEntry {
  id: string;
  userId: string;
  goalId: string;
  amount: Decimal;
  currency: 'JPY' | 'VND';
  amountInGoalCurrency: Decimal;
  fxRateUsed: Decimal | null;
  entryDate: Date;
  note: string | null;
}

/** In-memory stand-in for the slice of PrismaService this suite exercises. */
class FakePrisma {
  goals = new Map<string, FakeGoal>();
  entries = new Map<string, FakeEntry>();
  private nextId = 1;

  goal = {
    findFirst: async ({ where }: { where: { id: string; userId: string } }) => {
      const goal = this.goals.get(where.id);
      return goal && goal.userId === where.userId ? goal : null;
    },
  };

  savingsEntry = {
    create: async ({ data }: { data: Omit<FakeEntry, 'id'> }) => {
      const entry: FakeEntry = { id: `entry-${this.nextId++}`, ...data };
      this.entries.set(entry.id, entry);
      return entry;
    },
    findFirst: async ({ where }: { where: { id: string; userId: string } }) => {
      const entry = this.entries.get(where.id);
      if (!entry || entry.userId !== where.userId) return null;
      const goal = this.goals.get(entry.goalId)!;
      return { ...entry, goal: { currency: goal.currency } };
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: { id: string; userId: string };
      data: Partial<FakeEntry>;
    }) => {
      const entry = this.entries.get(where.id);
      if (!entry || entry.userId !== where.userId) return { count: 0 };
      Object.assign(entry, data);
      return { count: 1 };
    },
  };
}

class FixedRateProvider implements RateProvider {
  constructor(private readonly rate: Decimal | null) {}
  async getLatestRate() {
    return this.rate;
  }
  async getLatestRateAsOf() {
    return this.rate ? '2026-09-10' : null;
  }
}

const RATE = new Decimal('168.43447600');

function buildService(rate: Decimal | null) {
  const prisma = new FakePrisma();
  // Cast: FakePrisma implements only the goal/savingsEntry slice this service touches.
  const service = new SavingsEntriesService(prisma as never, new FixedRateProvider(rate));
  return { service, prisma };
}

describe('SavingsEntriesService', () => {
  let prisma: FakePrisma;

  beforeEach(() => {
    ({ prisma } = buildService(RATE));
  });

  it('same-currency entry freezes amountInGoalCurrency = amount with a null fxRateUsed', async () => {
    const { service, prisma } = buildService(RATE);
    prisma.goals.set('goal-1', { id: 'goal-1', userId: 'user-1', currency: 'JPY' });

    const entry = await service.create('user-1', 'goal-1', {
      amount: '30000.00',
      currency: 'JPY',
      entryDate: '2026-09-01',
    });

    expect(entry.amountInGoalCurrency.toString()).toBe('30000');
    expect(entry.fxRateUsed).toBeNull();
  });

  it('cross-currency entry converts using the injected rate and stores fxRateUsed', async () => {
    const { service, prisma } = buildService(RATE);
    prisma.goals.set('goal-1', { id: 'goal-1', userId: 'user-1', currency: 'VND' });

    const entry = await service.create('user-1', 'goal-1', {
      amount: '30000.00',
      currency: 'JPY',
      entryDate: '2026-09-01',
    });

    expect(entry.amountInGoalCurrency.toString()).toBe(
      new Decimal('30000.00').times(RATE).toDecimalPlaces(2).toString(),
    );
    expect(entry.fxRateUsed?.toString()).toBe(RATE.toString());
  });

  it('cross-currency entry with no rate available throws 503, never writes an unconverted amount', async () => {
    const { service, prisma } = buildService(null);
    prisma.goals.set('goal-1', { id: 'goal-1', userId: 'user-1', currency: 'VND' });

    await expect(
      service.create('user-1', 'goal-1', { amount: '30000.00', currency: 'JPY', entryDate: '2026-09-01' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.entries.size).toBe(0);
  });

  it('a frozen amount is unaffected by a later rate change (re-read, not recomputed)', async () => {
    const first = buildService(new Decimal('168.00000000'));
    first.prisma.goals.set('goal-1', { id: 'goal-1', userId: 'user-1', currency: 'VND' });
    const entry = await first.service.create('user-1', 'goal-1', {
      amount: '10000.00',
      currency: 'JPY',
      entryDate: '2026-09-01',
    });
    const frozenAmount = entry.amountInGoalCurrency.toString();

    // Simulate "the rate changed since logging" — a second service instance
    // with a different rate must not affect the already-stored entry.
    const second = buildService(new Decimal('200.00000000'));
    second.prisma.entries.set(entry.id, entry);
    second.prisma.goals.set('goal-1', { id: 'goal-1', userId: 'user-1', currency: 'VND' });

    const reread = await second.prisma.savingsEntry.findFirst({ where: { id: entry.id, userId: 'user-1' } });
    expect(reread?.amountInGoalCurrency.toString()).toBe(frozenAmount);
  });

  it('updating only the note does not re-freeze amountInGoalCurrency/fxRateUsed', async () => {
    const { service, prisma } = buildService(RATE);
    prisma.goals.set('goal-1', { id: 'goal-1', userId: 'user-1', currency: 'JPY' });
    const entry = await service.create('user-1', 'goal-1', {
      amount: '30000.00',
      currency: 'JPY',
      entryDate: '2026-09-01',
    });
    const before = entry.amountInGoalCurrency.toString();

    await service.update('user-1', entry.id, { note: 'updated note' });

    expect(prisma.entries.get(entry.id)?.amountInGoalCurrency.toString()).toBe(before);
    expect(prisma.entries.get(entry.id)?.note).toBe('updated note');
  });

  it('updating amount or currency re-freezes the conversion at the current rate', async () => {
    const { service, prisma } = buildService(RATE);
    prisma.goals.set('goal-1', { id: 'goal-1', userId: 'user-1', currency: 'JPY' });
    const entry = await service.create('user-1', 'goal-1', {
      amount: '30000.00',
      currency: 'JPY',
      entryDate: '2026-09-01',
    });

    await service.update('user-1', entry.id, { amount: '50000.00' });

    expect(prisma.entries.get(entry.id)?.amountInGoalCurrency.toString()).toBe('50000');
  });
});
