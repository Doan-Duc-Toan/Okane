import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * The security-critical suite for Phase 4: seeds two users (A and B) and
 * proves every cross-user access on goals and entries returns 404 — never
 * 200 (a leak) and never 403 (which would confirm the row exists). See
 * docs/data-model.md for the query-shape contract this suite is checking.
 */
describe('Data isolation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const stamp = Date.now();
  const userA = { email: `isolation-a-${stamp}@example.com`, password: 'Password123!' };
  const userB = { email: `isolation-b-${stamp}@example.com`, password: 'Password123!' };

  let tokenA: string;
  let tokenB: string;
  let goalIdA: string;
  let entryIdA: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleFixture.get(PrismaService);

    const server = app.getHttpServer();

    const regA = await request(server).post('/api/auth/register').send(userA).expect(201);
    tokenA = regA.body.accessToken;
    const regB = await request(server).post('/api/auth/register').send(userB).expect(201);
    tokenB = regB.body.accessToken;

    const goalRes = await request(server)
      .post('/api/goals')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: "A's goal", targetAmount: '1000.00', currency: 'JPY' })
      .expect(201);
    goalIdA = goalRes.body.id;

    const entryRes = await request(server)
      .post(`/api/goals/${goalIdA}/entries`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ amount: '100.00', currency: 'JPY', entryDate: new Date().toISOString().slice(0, 10) })
      .expect(201);
    entryIdA = entryRes.body.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: [userA.email, userB.email] } } });
    await app.close();
  });

  it("B cannot read A's goal", async () => {
    await request(app.getHttpServer())
      .get(`/api/goals/${goalIdA}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
  });

  it("B cannot update A's goal", async () => {
    await request(app.getHttpServer())
      .patch(`/api/goals/${goalIdA}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: 'hijacked' })
      .expect(404);
  });

  it("B cannot delete A's goal", async () => {
    await request(app.getHttpServer())
      .delete(`/api/goals/${goalIdA}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
  });

  it("B cannot create an entry under A's goal", async () => {
    await request(app.getHttpServer())
      .post(`/api/goals/${goalIdA}/entries`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ amount: '50.00', currency: 'JPY', entryDate: new Date().toISOString().slice(0, 10) })
      .expect(404);
  });

  it("B cannot list A's goal entries", async () => {
    await request(app.getHttpServer())
      .get(`/api/goals/${goalIdA}/entries`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
  });

  it("B cannot update A's entry", async () => {
    await request(app.getHttpServer())
      .patch(`/api/entries/${entryIdA}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ note: 'hijacked' })
      .expect(404);
  });

  it("B cannot delete A's entry", async () => {
    await request(app.getHttpServer())
      .delete(`/api/entries/${entryIdA}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
  });

  it("GET /api/goals for B never contains A's rows", async () => {
    const res = await request(app.getHttpServer())
      .get('/api/goals')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
    expect(res.body.some((g: { id: string }) => g.id === goalIdA)).toBe(false);
  });

  it("GET /api/dashboard for B never contains A's goal or entries", async () => {
    const res = await request(app.getHttpServer())
      .get('/api/dashboard')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
    expect(res.body.goals.some((g: { id: string }) => g.id === goalIdA)).toBe(false);
    expect(res.body.recentEntries.some((e: { id: string }) => e.id === entryIdA)).toBe(false);
  });

  it("A can still read their own goal and entry (isolation isn't over-blocking)", async () => {
    await request(app.getHttpServer())
      .get(`/api/goals/${goalIdA}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/goals/${goalIdA}/entries`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
  });

  // Budget/split isolation cases (Phase 6)
  it("B's GET /budget never returns A's settings", async () => {
    // A sets budget
    const setRes = await request(app.getHttpServer())
      .put('/api/budget')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        monthlyIncome: '500000.00',
        expenseRent: '100000.00',
        expenseFood: '50000.00',
        expenseOther: '25000.00',
        currency: 'VND',
      })
      .expect(200);
    expect(setRes.body.configured).toBe(true);

    // B's GET /budget should return configured:false, never A's settings
    const bRes = await request(app.getHttpServer())
      .get('/api/budget')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
    expect(bRes.body.configured).toBe(false);
    expect(bRes.body.settings).toBeNull();
  });

  it("B's PUT /budget creates B's own row; A's row remains unchanged", async () => {
    // Verify A's settings from prior test still exist
    const aRes1 = await request(app.getHttpServer())
      .get('/api/budget')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    const aInitialIncome = aRes1.body.settings.monthlyIncome;

    // B sets budget
    const bRes = await request(app.getHttpServer())
      .put('/api/budget')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        monthlyIncome: '300000.00',
        expenseRent: '80000.00',
        expenseFood: '40000.00',
        expenseOther: '20000.00',
        currency: 'VND',
      })
      .expect(200);
    expect(bRes.body.settings.monthlyIncome).toBe('300000.00');

    // A's budget should be unchanged
    const aRes2 = await request(app.getHttpServer())
      .get('/api/budget')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(aRes2.body.settings.monthlyIncome).toBe(aInitialIncome);
  });

  it("B's GET /budget/available counts only B's goals", async () => {
    // A creates a goal
    const aGoalRes = await request(app.getHttpServer())
      .post('/api/goals')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: "A's additional goal", targetAmount: '1000000.00', currency: 'VND', deadline: '2027-12-31' })
      .expect(201);

    // B sets budget first
    await request(app.getHttpServer())
      .put('/api/budget')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        monthlyIncome: '300000.00',
        expenseRent: '80000.00',
        expenseFood: '40000.00',
        expenseOther: '20000.00',
        currency: 'VND',
      })
      .expect(200);

    // B creates a goal
    const bGoalRes = await request(app.getHttpServer())
      .post('/api/goals')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: "B's goal", targetAmount: '500000.00', currency: 'VND', deadline: '2027-12-31' })
      .expect(201);

    // B's /budget/available should only count B's goal
    const bRes = await request(app.getHttpServer())
      .get('/api/budget/available')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
    expect(bRes.body.configured).toBe(true);
    const counted = bRes.body.counted || [];
    expect(counted.some((g: { goalId: string }) => g.goalId === aGoalRes.body.id)).toBe(false);
    expect(counted.some((g: { goalId: string }) => g.goalId === bGoalRes.body.id)).toBe(true);
  });

  it("B splitting into A's goal returns 404", async () => {
    // Get B's user ID
    const bUser = await prisma.user.findFirst({ where: { email: userB.email } });

    // Count before
    const countBefore = await prisma.savingsEntry.count({ where: { userId: bUser!.id } });

    // B tries to split into A's goal
    const res = await request(app.getHttpServer())
      .post('/api/entries/split')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        entryDate: new Date().toISOString().slice(0, 10),
        allocations: [{ goalId: goalIdA, amount: '100000.00', currency: 'VND' }],
      })
      .expect(404);
    expect(res.body.message).toContain('goalNotFound');

    // Verify no entries were written for B
    const countAfter = await prisma.savingsEntry.count({ where: { userId: bUser!.id } });
    expect(countAfter).toBe(countBefore);
  });
});
