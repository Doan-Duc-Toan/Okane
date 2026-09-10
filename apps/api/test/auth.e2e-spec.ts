import { Controller, Get, INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard.js';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Runs against `okane_test` (NODE_ENV=test -> .env.test, wired in app.module.ts).
// Never touches the dev database.
describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const email = `auth-e2e-${Date.now()}@example.com`;
  const password = 'Password123!';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    prisma = moduleFixture.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it('supports the full register -> protected read -> refresh -> old-token-rejected -> logout -> refresh-rejected flow', async () => {
    const server = app.getHttpServer();

    const registerRes = await request(server)
      .post('/api/auth/register')
      .send({ email, password })
      .expect(201);
    expect(registerRes.body.user.email).toBe(email);
    expect(registerRes.body.accessToken).toEqual(expect.any(String));
    expect(registerRes.body.refreshToken).toEqual(expect.any(String));

    const loginRes = await request(server).post('/api/auth/login').send({ email, password }).expect(200);
    const { accessToken, refreshToken } = loginRes.body;

    await request(server)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect((res) => {
        expect(res.body.email).toBe(email);
      });

    await request(server).get('/api/auth/me').expect(401);

    const refreshRes = await request(server).post('/api/auth/refresh').send({ refreshToken }).expect(200);
    const newRefreshToken = refreshRes.body.refreshToken;
    const newAccessToken = refreshRes.body.accessToken;
    expect(newRefreshToken).not.toBe(refreshToken);

    // The rotated-away token must now be rejected.
    await request(server).post('/api/auth/refresh').send({ refreshToken }).expect(401);

    // Logout is not @Public() — it requires a valid access token even though
    // the revocation itself only needs the refresh token in the body.
    await request(server)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${newAccessToken}`)
      .send({ refreshToken: newRefreshToken })
      .expect(204);

    // A logged-out token can no longer be refreshed.
    await request(server).post('/api/auth/refresh').send({ refreshToken: newRefreshToken }).expect(401);
  });

  it('rejects a duplicate registration with 409', async () => {
    const dupeEmail = `dupe-${Date.now()}@example.com`;
    await request(app.getHttpServer()).post('/api/auth/register').send({ email: dupeEmail, password }).expect(201);
    await request(app.getHttpServer()).post('/api/auth/register').send({ email: dupeEmail, password }).expect(409);
    await prisma.user.deleteMany({ where: { email: dupeEmail } });
  });

  it('returns an identical body/status for unknown-email and wrong-password logins', async () => {
    const unknownRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: `nobody-${Date.now()}@example.com`, password })
      .expect(401);

    const wrongPasswordRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'WrongPassword1' })
      .expect(401);

    expect(wrongPasswordRes.body).toEqual(unknownRes.body);
  });

  it('rejects a request with no token', async () => {
    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
  });

  it('fails closed: a fresh controller with no @Public() decorator is inaccessible without a token', async () => {
    // Proves the central claim of Phase 3 in isolation from AppModule's own
    // routes: APP_GUARD protects any handler that doesn't opt out, including
    // one that didn't exist when the guard was wired up.
    @Controller('throwaway')
    class ThrowawayController {
      @Get()
      ping() {
        return 'pong';
      }
    }

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env.test' }),
        PassportModule,
      ],
      controllers: [ThrowawayController],
      providers: [Reflector, JwtStrategy, { provide: APP_GUARD, useClass: JwtAuthGuard }],
    }).compile();

    const throwawayApp = moduleRef.createNestApplication();
    await throwawayApp.init();

    await request(throwawayApp.getHttpServer()).get('/throwaway').expect(401);

    await throwawayApp.close();
  });
});
