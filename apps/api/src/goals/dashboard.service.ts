import { Injectable } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service.js';
import { GoalsService } from './goals.service.js';

const RECENT_ENTRIES_LIMIT = 10;

export interface CurrencyTotal {
  currency: string;
  savedAmount: Decimal;
  targetAmount: Decimal;
  goalCount: number;
}

/**
 * One round-trip for the dashboard screen: per-currency totals, every goal
 * with its progress block, and the 10 most recent entries. Query count stays
 * fixed (5) regardless of how many goals/entries a user has — see
 * GoalsService.findAllForUser for the goals+progress query shape.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly goalsService: GoalsService,
  ) {}

  async getDashboard(userId: string) {
    const [goals, recentEntriesRaw] = await Promise.all([
      this.goalsService.findAllForUser(userId),
      this.prisma.savingsEntry.findMany({
        where: { userId },
        orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
        take: RECENT_ENTRIES_LIMIT,
        include: { goal: { select: { name: true } } },
      }),
    ]);

    // Frozen contract (phase-04): each recent entry carries a flat
    // `goalName` string, not a nested `{ goal: { name } }` — the `include`
    // above is the cheapest query shape to get the name, so it's flattened
    // here rather than exposing the nested Prisma include shape to clients.
    const recentEntries = recentEntriesRaw.map(({ goal, ...entry }) => ({ ...entry, goalName: goal.name }));

    const totalsByCurrency = new Map<string, CurrencyTotal>();
    for (const goal of goals) {
      const bucket = totalsByCurrency.get(goal.currency) ?? {
        currency: goal.currency,
        savedAmount: new Decimal(0),
        targetAmount: new Decimal(0),
        goalCount: 0,
      };
      bucket.savedAmount = bucket.savedAmount.plus(goal.progress.savedAmount);
      bucket.targetAmount = bucket.targetAmount.plus(goal.targetAmount);
      bucket.goalCount += 1;
      totalsByCurrency.set(goal.currency, bucket);
    }

    return {
      totals: [...totalsByCurrency.values()],
      goals,
      recentEntries,
    };
  }
}
