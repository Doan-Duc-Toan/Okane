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
});
