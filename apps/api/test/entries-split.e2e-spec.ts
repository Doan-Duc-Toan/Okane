import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type Decimal from 'decimal.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { RATE_PROVIDER, type RateProvider } from '../src/common/rate-provider.interface.js';

/**
 * Mutable fake RateProvider for e2e tests.
 */
class FakeRateProvider implements RateProvider {
  private _rate: Decimal | null = null;
  private _rateAsOf: string | null = null;

  setRate(rate: Decimal | null, rateAsOf?: string | null) {
    this._rate = rate;
    this._rateAsOf = rateAsOf ?? null;
  }

  async getLatestRate(): Promise<Decimal | null> {
    return this._rate;
  }

  async getLatestRateAsOf(): Promise<string | null> {
    return this._rateAsOf;
  }
}

describe('Entries split (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fakeRateProvider: FakeRateProvider;

  const stamp = Date.now();
  const testUser = { email: `split-e2e-${stamp}@example.com`, password: 'Password123!' };
  let token: string;
  let userId: string;

  beforeAll(async () => {
    fakeRateProvider = new FakeRateProvider();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RATE_PROVIDER)
      .useValue(fakeRateProvider)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleFixture.get(PrismaService);

    const server = app.getHttpServer();
    const reg = await request(server).post('/api/auth/register').send(testUser).expect(201);
    token = reg.body.accessToken;
    userId = reg.body.user.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: testUser.email } });
    await app.close();
  });

  describe('with rate present', () => {
    beforeAll(() => {
      const Decimal = require('decimal.js');
      fakeRateProvider.setRate(new Decimal('0.01'), '2026-09-14');
    });

    let vndGoal1Id: string;
    let vndGoal2Id: string;
    let jpyGoal1Id: string;
    let jpyGoal2Id: string;

    beforeAll(async () => {
      // Create multiple goals for the tests
      const vnd1Res = await request(app.getHttpServer())
        .post('/api/goals')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'VND goal 1',
          targetAmount: '10000000.00',
          currency: 'VND',
          deadline: '2027-12-31',
        })
        .expect(201);
      vndGoal1Id = vnd1Res.body.id;

      const vnd2Res = await request(app.getHttpServer())
        .post('/api/goals')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'VND goal 2',
          targetAmount: '5000000.00',
          currency: 'VND',
          deadline: '2027-12-31',
        })
        .expect(201);
      vndGoal2Id = vnd2Res.body.id;

      const jpy1Res = await request(app.getHttpServer())
        .post('/api/goals')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'JPY goal 1',
          targetAmount: '1000000.00',
          currency: 'JPY',
          deadline: '2027-12-31',
        })
        .expect(201);
      jpyGoal1Id = jpy1Res.body.id;

      const jpy2Res = await request(app.getHttpServer())
        .post('/api/goals')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'JPY goal 2',
          targetAmount: '500000.00',
          currency: 'JPY',
          deadline: '2027-12-31',
        })
        .expect(201);
      jpyGoal2Id = jpy2Res.body.id;
    });

    afterAll(async () => {
      await prisma.goal.deleteMany({ where: { id: { in: [vndGoal1Id, vndGoal2Id, jpyGoal1Id, jpyGoal2Id] } } });
    });

    // Case 1: Split across 2 same-currency goals
    it('creates split entries across same-currency goals', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/entries/split')
        .set('Authorization', `Bearer ${token}`)
        .send({
          entryDate: '2026-09-14',
          allocations: [
            { goalId: vndGoal1Id, amount: '1000000.00', currency: 'VND' },
            { goalId: vndGoal2Id, amount: '500000.00', currency: 'VND' },
          ],
        })
        .expect(201);

      expect(res.body.entries).toHaveLength(2);
      expect(res.body.entries[0].fxRateUsed).toBeNull();
      expect(res.body.entries[1].fxRateUsed).toBeNull();
      expect(res.body.entries[0].amount).toBe('1000000.00');
      expect(res.body.entries[1].amount).toBe('500000.00');
    });

    // Case 2: Split including a cross-currency goal
    it('converts amount for cross-currency allocation', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/entries/split')
        .set('Authorization', `Bearer ${token}`)
        .send({
          entryDate: '2026-09-14',
          allocations: [
            { goalId: vndGoal1Id, amount: '1000000.00', currency: 'VND' },
            { goalId: jpyGoal1Id, amount: '50000.00', currency: 'VND' },
          ],
        })
        .expect(201);

      expect(res.body.entries).toHaveLength(2);
      // First entry (VND->VND) should have null rate
      expect(res.body.entries[0].fxRateUsed).toBeNull();
      // Second entry (VND->JPY) should have non-null rate and converted amount
      expect(res.body.entries[1].fxRateUsed).not.toBeNull();
      expect(res.body.entries[1].amountInGoalCurrency).not.toBe('50000.00');
    });

    // Case 3: All entries in one split share one fxRateUsed
    it('uses same rate for all entries in one split', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/entries/split')
        .set('Authorization', `Bearer ${token}`)
        .send({
          entryDate: '2026-09-14',
          allocations: [
            { goalId: jpyGoal1Id, amount: '30000.00', currency: 'VND' },
            { goalId: jpyGoal2Id, amount: '40000.00', currency: 'VND' },
          ],
        })
        .expect(201);

      expect(res.body.entries).toHaveLength(2);
      expect(res.body.entries[0].fxRateUsed).toBe(res.body.entries[1].fxRateUsed);
      expect(res.body.entries[0].fxRateUsed).not.toBeNull();
    });

    // Case 4: Dashboard savedAmount moves by exactly the allocation
    it('updates goal savedAmount correctly after split', async () => {
      // Get initial state
      const initialGoal = await request(app.getHttpServer())
        .get(`/api/goals/${vndGoal1Id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const initialSaved = initialGoal.body.progress.savedAmount;

      // Create split with known amount
      await request(app.getHttpServer())
        .post('/api/entries/split')
        .set('Authorization', `Bearer ${token}`)
        .send({
          entryDate: '2026-09-14',
          allocations: [
            { goalId: vndGoal1Id, amount: '2000000.00', currency: 'VND' },
            { goalId: vndGoal2Id, amount: '3000000.00', currency: 'VND' },
          ],
        })
        .expect(201);

      // Get goal after split
      const updatedGoal = await request(app.getHttpServer())
        .get(`/api/goals/${vndGoal1Id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const updatedSaved = updatedGoal.body.progress.savedAmount;

      // Amount should have moved by exactly 2000000 (the vndGoal1 allocation)
      const Decimal = require('decimal.js');
      const expected = new Decimal(initialSaved).plus('2000000.00').toFixed(2);
      expect(updatedSaved).toBe(expected);
    });

    // Case 5: Empty allocations
    it('rejects split with empty allocations', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/entries/split')
        .set('Authorization', `Bearer ${token}`)
        .send({
          entryDate: '2026-09-14',
          allocations: [],
        })
        .expect(400);

      expect(res.body.message || res.body.error).toContain('splitAllocationsEmpty');
    });

    // Case 6: Duplicate goalId
    it('rejects split with duplicate goalId', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/entries/split')
        .set('Authorization', `Bearer ${token}`)
        .send({
          entryDate: '2026-09-14',
          allocations: [
            { goalId: vndGoal1Id, amount: '100000.00', currency: 'VND' },
            { goalId: vndGoal1Id, amount: '50000.00', currency: 'VND' },
          ],
        })
        .expect(400);

      expect(res.body.message || res.body.error).toContain('splitDuplicateGoal');
    });

    // Case 7: 21 allocations (exceeds MAX_ALLOCATIONS=20)
    it('rejects split with too many allocations', async () => {
      const allocations = [];
      // Create 21 allocations with distinct UUIDs to avoid duplicate validation
      for (let i = 0; i < 21; i++) {
        allocations.push({
          goalId: `f47ac10b-58cc-4372-a567-0e02b2c3d${String(i).padStart(3, '0')}`,
          amount: '100.00',
          currency: 'VND',
        });
      }

      const res = await request(app.getHttpServer())
        .post('/api/entries/split')
        .set('Authorization', `Bearer ${token}`)
        .send({
          entryDate: '2026-09-14',
          allocations,
        })
        .expect(400);

      expect(res.body.message || res.body.error).toContain('splitAllocationsTooMany');
    });

    // Case 8: Future entryDate
    it('rejects split with future entryDate', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);
      const futureDateStr = futureDate.toISOString().slice(0, 10);

      const res = await request(app.getHttpServer())
        .post('/api/entries/split')
        .set('Authorization', `Bearer ${token}`)
        .send({
          entryDate: futureDateStr,
          allocations: [{ goalId: vndGoal1Id, amount: '100000.00', currency: 'VND' }],
        })
        .expect(400);

      expect(res.body.message || res.body.error).toContain('entryDateFuture');
    });

    // Case 9: Non-positive amount
    it('rejects split with non-positive amount', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/entries/split')
        .set('Authorization', `Bearer ${token}`)
        .send({
          entryDate: '2026-09-14',
          allocations: [{ goalId: vndGoal1Id, amount: '0.00', currency: 'VND' }],
        })
        .expect(400);

      expect(res.body.message || res.body.error).toContain('splitAmountInvalid');
    });

    // Case 10: One foreign goalId among valid ones
    it('rejects split with foreign goalId and writes zero entries', async () => {
      // Count before
      const countBefore = await prisma.savingsEntry.count({ where: { userId } });

      const res = await request(app.getHttpServer())
        .post('/api/entries/split')
        .set('Authorization', `Bearer ${token}`)
        .send({
          entryDate: '2026-09-14',
          allocations: [
            { goalId: vndGoal1Id, amount: '1000000.00', currency: 'VND' },
            { goalId: 'f47ac10b-58cc-4372-a567-0e02b2c3d470', amount: '500000.00', currency: 'VND' },
          ],
        })
        .expect(404);

      expect(res.body.message || res.body.error).toContain('goalNotFound');

      // Count after should be unchanged
      const countAfter = await prisma.savingsEntry.count({ where: { userId } });
      expect(countAfter).toBe(countBefore);
    });
  });

  describe('with rate null', () => {
    beforeAll(() => {
      fakeRateProvider.setRate(null);
    });

    let jpyGoalId: string;

    beforeAll(async () => {
      const jpyRes = await request(app.getHttpServer())
        .post('/api/goals')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'JPY goal for null rate',
          targetAmount: '500000.00',
          currency: 'JPY',
          deadline: '2027-12-31',
        })
        .expect(201);
      jpyGoalId = jpyRes.body.id;
    });

    afterAll(async () => {
      await prisma.goal.delete({ where: { id: jpyGoalId } });
    });

    // Case 11: Cross-currency with rate null
    it('returns 503 with rateUnavailable when rate is null', async () => {
      // Count before
      const countBefore = await prisma.savingsEntry.count({ where: { userId } });

      const res = await request(app.getHttpServer())
        .post('/api/entries/split')
        .set('Authorization', `Bearer ${token}`)
        .send({
          entryDate: '2026-09-14',
          allocations: [
            { goalId: jpyGoalId, amount: '50000.00', currency: 'VND' },
          ],
        })
        .expect(503);

      expect(res.body.message).toContain('rateUnavailable');

      // Count after should be unchanged — the rate check throws before the
      // transaction is ever opened, so there's nothing to roll back.
      const countAfter = await prisma.savingsEntry.count({ where: { userId } });
      expect(countAfter).toBe(countBefore);
    });
  });
});
