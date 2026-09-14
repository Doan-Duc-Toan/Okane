import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type Decimal from 'decimal.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { RATE_PROVIDER, type RateProvider } from '../src/common/rate-provider.interface.js';

/**
 * Mutable fake RateProvider for e2e tests. Allows each suite to set a fixed
 * rate or null, providing deterministic cross-currency conversion without
 * network dependencies.
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

describe('Budget (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fakeRateProvider: FakeRateProvider;

  const stamp = Date.now();
  const testUser = { email: `budget-e2e-${stamp}@example.com`, password: 'Password123!' };
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

    // Case 1: GET /budget on a fresh user
    it('returns configured:false and settings:null for unconfigured user', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/budget')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toEqual({
        configured: false,
        settings: null,
      });
    });

    // Case 2: PUT /budget valid
    it('creates budget settings with valid input', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/budget')
        .set('Authorization', `Bearer ${token}`)
        .send({
          monthlyIncome: '400000.00',
          expenseRent: '100000.00',
          expenseFood: '50000.00',
          expenseOther: '25000.00',
          currency: 'VND',
        })
        .expect(200);

      expect(res.body.configured).toBe(true);
      expect(res.body.settings).toBeDefined();
      expect(res.body.settings.monthlyIncome).toBe('400000.00');
      expect(res.body.settings.expenseRent).toBe('100000.00');
      expect(res.body.settings.expenseFood).toBe('50000.00');
      expect(res.body.settings.expenseOther).toBe('25000.00');
      expect(res.body.settings.currency).toBe('VND');
    });

    // Case 3: PUT /budget twice upserts
    it('upserts budget settings on second PUT', async () => {
      const res1 = await request(app.getHttpServer())
        .put('/api/budget')
        .set('Authorization', `Bearer ${token}`)
        .send({
          monthlyIncome: '500000.00',
          expenseRent: '120000.00',
          expenseFood: '60000.00',
          expenseOther: '30000.00',
          currency: 'VND',
        })
        .expect(200);

      expect(res1.body.configured).toBe(true);
      expect(res1.body.settings.monthlyIncome).toBe('500000.00');

      // Verify only one row exists for this user
      const count = await prisma.budgetSettings.count({ where: { userId } });
      expect(count).toBe(1);

      // Verify the second PUT truly updated
      const res2 = await request(app.getHttpServer())
        .get('/api/budget')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res2.body.settings.monthlyIncome).toBe('500000.00');
      expect(res2.body.settings.expenseRent).toBe('120000.00');
    });

    // Case 4: PUT negative income
    it('rejects negative monthly income', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/budget')
        .set('Authorization', `Bearer ${token}`)
        .send({
          monthlyIncome: '-100.00',
          expenseRent: '10000.00',
          expenseFood: '5000.00',
          expenseOther: '2000.00',
          currency: 'VND',
        })
        .expect(400);

      expect(res.body.message).toContain('budgetIncomeInvalid');
    });

    // Case 5: PUT bad currency
    it('rejects invalid currency', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/budget')
        .set('Authorization', `Bearer ${token}`)
        .send({
          monthlyIncome: '100000.00',
          expenseRent: '10000.00',
          expenseFood: '5000.00',
          expenseOther: '2000.00',
          currency: 'INVALID',
        })
        .expect(400);

      expect(res.body.message).toContain('budgetCurrencyInvalid');
    });

    // Case 6: PUT with extra body field
    it('rejects extra body fields (forbidNonWhitelisted)', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/budget')
        .set('Authorization', `Bearer ${token}`)
        .send({
          monthlyIncome: '100000.00',
          expenseRent: '10000.00',
          expenseFood: '5000.00',
          expenseOther: '2000.00',
          currency: 'VND',
          extraField: 'should not be here',
        })
        .expect(400);

      expect(res.body.message).toContain('property extraField should not exist');
    });

    // Case 7: GET /budget/available unconfigured
    it('returns configured:false when no budget set', async () => {
      // Create a second user
      const stamp2 = Date.now() + 1;
      const user2 = { email: `budget-e2e-uncfg-${stamp2}@example.com`, password: 'Password123!' };
      const reg2 = await request(app.getHttpServer()).post('/api/auth/register').send(user2).expect(201);
      const token2 = reg2.body.accessToken;

      const res = await request(app.getHttpServer())
        .get('/api/budget/available')
        .set('Authorization', `Bearer ${token2}`)
        .expect(200);

      expect(res.body).toEqual({ configured: false });

      // Clean up
      await prisma.user.deleteMany({ where: { email: user2.email } });
    });

    // Case 8: GET /budget/available configured with one on-track goal
    it('computes available with configured budget and goal', async () => {
      // First ensure budget is set
      await request(app.getHttpServer())
        .put('/api/budget')
        .set('Authorization', `Bearer ${token}`)
        .send({
          monthlyIncome: '1000000.00',
          expenseRent: '200000.00',
          expenseFood: '100000.00',
          expenseOther: '50000.00',
          currency: 'VND',
        })
        .expect(200);

      // Create a goal in same currency
      const goalRes = await request(app.getHttpServer())
        .post('/api/goals')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Vacation fund',
          targetAmount: '5000000.00',
          currency: 'VND',
          deadline: '2027-12-31',
        })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/budget/available')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.configured).toBe(true);
      // available = income - expenses - goal need
      // = 1000000 - 350000 - (some goal need) = positive
      expect(res.body).toHaveProperty('available');
      expect(res.body).toHaveProperty('counted');

      // Clean up
      await prisma.goal.delete({ where: { id: goalRes.body.id } });
    });

    // Case 9: Goal with no deadline appears in excluded with reason:no_deadline
    it('excludes goals with no deadline', async () => {
      // Create a goal without deadline
      const goalRes = await request(app.getHttpServer())
        .post('/api/goals')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'No deadline goal',
          targetAmount: '1000000.00',
          currency: 'VND',
        })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/budget/available')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.configured).toBe(true);
      expect(res.body.excluded).toBeDefined();
      const excluded = res.body.excluded.find((e: { goalId: string; reason: string }) => e.goalId === goalRes.body.id);
      expect(excluded).toBeDefined();
      expect(excluded.reason).toBe('no_deadline');

      // Clean up
      await prisma.goal.delete({ where: { id: goalRes.body.id } });
    });

    // Case 10: Cross-currency goal with rate present
    it('converts cross-currency goals with available rate', async () => {
      // Create a goal in JPY
      const goalRes = await request(app.getHttpServer())
        .post('/api/goals')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Japan trip',
          targetAmount: '500000.00',
          currency: 'JPY',
          deadline: '2027-06-30',
        })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/budget/available')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.configured).toBe(true);
      expect(res.body.rateUsed).not.toBeNull();
      expect(res.body.rateAsOf).toBe('2026-09-14');

      // Should have a counted entry for the JPY goal (converted to VND)
      const counted = res.body.counted.find((c: { goalId: string }) => c.goalId === goalRes.body.id);
      expect(counted).toBeDefined();
      expect(counted.needInBudgetCurrency).toBeDefined();

      // Clean up
      await prisma.goal.delete({ where: { id: goalRes.body.id } });
    });
  });

  describe('with rate null', () => {
    beforeAll(() => {
      fakeRateProvider.setRate(null);
    });

    // Case 11: Cross-currency goal with rate null returns 200 with rateUnavailable:true
    it('returns 200 with rateUnavailable:true when rate is null', async () => {
      // Ensure budget is configured
      await request(app.getHttpServer())
        .put('/api/budget')
        .set('Authorization', `Bearer ${token}`)
        .send({
          monthlyIncome: '1000000.00',
          expenseRent: '200000.00',
          expenseFood: '100000.00',
          expenseOther: '50000.00',
          currency: 'VND',
        })
        .expect(200);

      // Create a cross-currency goal
      const goalRes = await request(app.getHttpServer())
        .post('/api/goals')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'JPY goal no rate',
          targetAmount: '300000.00',
          currency: 'JPY',
          deadline: '2027-03-15',
        })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/budget/available')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.configured).toBe(true);
      expect(res.body.rateUnavailable).toBe(true);
      expect(res.body.rateAsOf).toBeNull();

      // Clean up
      await prisma.goal.delete({ where: { id: goalRes.body.id } });
    });

    // Case 12: Overrun scenario
    it('computes allocation when shortfall exists', async () => {
      // Set a small budget
      await request(app.getHttpServer())
        .put('/api/budget')
        .set('Authorization', `Bearer ${token}`)
        .send({
          monthlyIncome: '500000.00',
          expenseRent: '200000.00',
          expenseFood: '100000.00',
          expenseOther: '50000.00',
          currency: 'VND',
        })
        .expect(200);

      // Create goals that exceed available (500k - 350k = 150k available)
      const goal1 = await request(app.getHttpServer())
        .post('/api/goals')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'High need goal 1',
          targetAmount: '2000000.00',
          currency: 'VND',
          deadline: '2027-12-31',
        })
        .expect(201);

      const goal2 = await request(app.getHttpServer())
        .post('/api/goals')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'High need goal 2',
          targetAmount: '1500000.00',
          currency: 'VND',
          deadline: '2027-12-31',
        })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/budget/available')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Should have shortfall > 0 and allocation
      const Decimal = require('decimal.js');
      const shortfall = new Decimal(res.body.shortfall);
      expect(shortfall.greaterThan(0)).toBe(true);
      expect(res.body.allocation).toBeDefined();
      expect(Array.isArray(res.body.allocation)).toBe(true);
      expect(res.body.allocation.length).toBeGreaterThan(0);
      // Each allocation should have an amount > 0
      for (const alloc of res.body.allocation) {
        expect(new Decimal(alloc.amount).greaterThan(0)).toBe(true);
      }

      // Clean up
      await prisma.goal.deleteMany({ where: { id: { in: [goal1.body.id, goal2.body.id] } } });
    });
  });

  // Case 13: No token
  it('returns 401 on GET /budget without token', async () => {
    await request(app.getHttpServer())
      .get('/api/budget')
      .expect(401);
  });

  it('returns 401 on PUT /budget without token', async () => {
    await request(app.getHttpServer())
      .put('/api/budget')
      .send({
        monthlyIncome: '100000.00',
        expenseRent: '10000.00',
        expenseFood: '5000.00',
        expenseOther: '2000.00',
        currency: 'VND',
      })
      .expect(401);
  });

  it('returns 401 on GET /budget/available without token', async () => {
    await request(app.getHttpServer())
      .get('/api/budget/available')
      .expect(401);
  });
});
