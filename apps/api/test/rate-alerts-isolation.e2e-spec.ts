import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * The security-critical suite for Phase 5's alert CRUD, mirroring
 * data-isolation.e2e-spec.ts's contract: every cross-user access on a rate
 * alert must 404 (never 200, never 403). Also covers the "empty table"
 * read-path requirement from phase-05's Implementation Steps: `/rates/current`
 * with no snapshot yet must return a clean 404, never a 500.
 */
describe('Rate alerts isolation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const stamp = Date.now();
  const userA = { email: `rate-alert-a-${stamp}@example.com`, password: 'Password123!' };
  const userB = { email: `rate-alert-b-${stamp}@example.com`, password: 'Password123!' };

  let tokenA: string;
  let tokenB: string;
  let alertIdA: string;

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

    const alertRes = await request(server)
      .post('/api/rate-alerts')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ direction: 'ABOVE', threshold: '170' })
      .expect(201);
    alertIdA = alertRes.body.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: [userA.email, userB.email] } } });
    await app.close();
  });

  it("B cannot read A's alert list and never sees A's alert", async () => {
    const res = await request(app.getHttpServer())
      .get('/api/rate-alerts')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
    expect(res.body.some((a: { id: string }) => a.id === alertIdA)).toBe(false);
  });

  it("B cannot update A's alert", async () => {
    await request(app.getHttpServer())
      .patch(`/api/rate-alerts/${alertIdA}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ threshold: '999' })
      .expect(404);
  });

  it("B cannot delete A's alert", async () => {
    await request(app.getHttpServer())
      .delete(`/api/rate-alerts/${alertIdA}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
  });

  it('A can still read, update, and delete their own alert (isolation is not over-blocking)', async () => {
    const server = app.getHttpServer();
    await request(server)
      .patch(`/api/rate-alerts/${alertIdA}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ threshold: '175' })
      .expect(200)
      .expect((res) => {
        expect(res.body.threshold).toBe('175.00000000');
      });

    await request(server).delete(`/api/rate-alerts/${alertIdA}`).set('Authorization', `Bearer ${tokenA}`).expect(204);
  });

  it('rejects a non-positive threshold with 400', async () => {
    await request(app.getHttpServer())
      .post('/api/rate-alerts')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ direction: 'ABOVE', threshold: '0' })
      .expect(400);
  });

  it('caps alerts per user at 10', async () => {
    const server = app.getHttpServer();
    for (let i = 0; i < 10; i++) {
      await request(server)
        .post('/api/rate-alerts')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ direction: 'ABOVE', threshold: String(160 + i) })
        .expect(201);
    }
    await request(server)
      .post('/api/rate-alerts')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ direction: 'ABOVE', threshold: '171' })
      .expect(400);
  });

  it('GET /rates/current on an empty snapshot table returns a clean 404, never a 500', async () => {
    // Arrange true emptiness for this one assertion: AppModule's own
    // ExchangeRateModule bootstrap (onModuleInit) already wrote today's real
    // snapshot as a side effect of this suite's app.init() above, same as
    // every other e2e suite that boots the full AppModule. Clearing it here
    // is what actually exercises the "no snapshot yet" code path phase-05
    // requires; e2e files run sequentially (see vitest.config.e2e.ts), so
    // this can't race a concurrent suite's own assertions.
    await prisma.rateSnapshot.deleteMany({});

    await request(app.getHttpServer())
      .get('/api/rates/current')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(404);
  });
});
