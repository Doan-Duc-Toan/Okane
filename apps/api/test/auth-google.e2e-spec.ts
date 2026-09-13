import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { GoogleTokenVerifier, type GoogleIdentity } from '../src/auth/google-token.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * Mutable fake GoogleTokenVerifier for e2e tests. Allows each test to set the
 * identity that will be returned, or to trigger a verification failure.
 */
class FakeGoogleTokenVerifier implements Partial<GoogleTokenVerifier> {
  isConfigured = true;
  private _nextIdentity: GoogleIdentity | null = null;
  private _throwNext = false;

  setNextIdentity(identity: GoogleIdentity) {
    this._nextIdentity = identity;
    this._throwNext = false;
  }

  throwNext() {
    this._throwNext = true;
    this._nextIdentity = null;
  }

  async verify(_credential: string): Promise<GoogleIdentity> {
    if (this._throwNext) {
      this._throwNext = false;
      throw new UnauthorizedException('googleTokenInvalid');
    }
    if (!this._nextIdentity) {
      throw new Error('no identity configured in fake');
    }
    const identity = this._nextIdentity;
    // Reset so the next test starts clean
    this._nextIdentity = null;
    return identity;
  }
}

// Runs against `okane_test` (NODE_ENV=test -> .env.test, wired in app.module.ts).
// Never touches the dev database.
describe('Auth Google (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fakeVerifier: FakeGoogleTokenVerifier;

  beforeAll(async () => {
    fakeVerifier = new FakeGoogleTokenVerifier();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(GoogleTokenVerifier)
      .useValue(fakeVerifier)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    prisma = moduleFixture.get(PrismaService);
  });

  afterAll(async () => {
    // Delete all test users
    await prisma.user.deleteMany({
      where: {
        email: {
          contains: 'auth-google-e2e-',
        },
      },
    });
    await app.close();
  });

  it('returns a valid session (accessToken, refreshToken, expiresIn, user) from Google login', async () => {
    const email = `auth-google-e2e-${Date.now()}@example.com`;

    fakeVerifier.setNextIdentity({
      sub: 'google-sub-1',
      email,
      emailVerified: true,
      name: 'Google User',
    });

    const res = await request(app.getHttpServer())
      .post('/api/auth/google')
      .send({ credential: 'fake-google-token' })
      .expect(200);

    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.refreshToken).toEqual(expect.any(String));
    expect(res.body.expiresIn).toEqual(expect.any(Number));
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe(email);
    expect(res.body.user.displayName).toBe('Google User');
    expect(res.body.user.id).toEqual(expect.any(String));

    // Verify the returned accessToken works against GET /api/auth/me
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${res.body.accessToken}`)
      .expect(200)
      .expect((res) => {
        expect(res.body.email).toBe(email);
      });
  });

  it('the returned refreshToken rotates through POST /api/auth/refresh', async () => {
    const email = `auth-google-e2e-${Date.now()}@example.com`;

    fakeVerifier.setNextIdentity({
      sub: 'google-sub-2',
      email,
      emailVerified: true,
      name: 'Refresh Tester',
    });

    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/google')
      .send({ credential: 'fake-google-token' })
      .expect(200);

    const { refreshToken: originalRefreshToken } = loginRes.body;

    const refreshRes = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: originalRefreshToken })
      .expect(200);

    expect(refreshRes.body.refreshToken).not.toBe(originalRefreshToken);
    expect(refreshRes.body.accessToken).toEqual(expect.any(String));
    expect(refreshRes.body.expiresIn).toEqual(expect.any(Number));

    // The original token must now be rejected
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: originalRefreshToken })
      .expect(401);
  });

  it('the same Google identity twice returns the same user id', async () => {
    const email = `auth-google-e2e-${Date.now()}@example.com`;
    const googleSub = 'google-sub-idempotent';

    fakeVerifier.setNextIdentity({
      sub: googleSub,
      email,
      emailVerified: true,
      name: 'First Login',
    });

    const firstRes = await request(app.getHttpServer())
      .post('/api/auth/google')
      .send({ credential: 'fake-token-1' })
      .expect(200);

    const userId = firstRes.body.user.id;

    fakeVerifier.setNextIdentity({
      sub: googleSub,
      email,
      emailVerified: true,
      name: 'Second Login',
    });

    const secondRes = await request(app.getHttpServer())
      .post('/api/auth/google')
      .send({ credential: 'fake-token-2' })
      .expect(200);

    expect(secondRes.body.user.id).toBe(userId);
  });

  it('links a Google account to an existing password-registered account and preserves password login', async () => {
    const email = `auth-google-e2e-${Date.now()}@example.com`;
    const password = 'Password123!';

    // Step 1: Register with password
    const registerRes = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password, displayName: 'Password Account' })
      .expect(201);

    const userId = registerRes.body.user.id;

    // Step 2: Sign in with Google using the same email
    fakeVerifier.setNextIdentity({
      sub: 'google-sub-linking',
      email,
      emailVerified: true,
      name: 'Google Linked',
    });

    const googleRes = await request(app.getHttpServer())
      .post('/api/auth/google')
      .send({ credential: 'fake-google-token' })
      .expect(200);

    // Must be the same user
    expect(googleRes.body.user.id).toBe(userId);

    // Step 3: Verify password login still works
    const passwordLoginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);

    expect(passwordLoginRes.body.user.id).toBe(userId);
  });

  it('rejects an unverified email with message containing googleEmailUnverified', async () => {
    const email = `auth-google-e2e-${Date.now()}@example.com`;

    fakeVerifier.setNextIdentity({
      sub: 'google-sub-unverified',
      email,
      emailVerified: false,
      name: 'Unverified',
    });

    const res = await request(app.getHttpServer())
      .post('/api/auth/google')
      .send({ credential: 'fake-token' })
      .expect(401);

    expect(res.body.message).toContain('googleEmailUnverified');
  });

  it('rejects an invalid token with message containing googleTokenInvalid', async () => {
    fakeVerifier.throwNext();

    const res = await request(app.getHttpServer())
      .post('/api/auth/google')
      .send({ credential: 'invalid-token' })
      .expect(401);

    expect(res.body.message).toContain('googleTokenInvalid');
  });

  it('rejects an empty credential with 400 / credentialRequired, and forbidNonWhitelisted blocks extra fields', async () => {
    // No credential at all
    const emptyRes = await request(app.getHttpServer())
      .post('/api/auth/google')
      .send({})
      .expect(400);

    expect(emptyRes.body.message).toContain('credentialRequired');

    // Extra field should be rejected by forbidNonWhitelisted
    const extraRes = await request(app.getHttpServer())
      .post('/api/auth/google')
      .send({ credential: 'fake-token', extra: 'field' })
      .expect(400);

    // ValidationPipe rejects extra fields with a message array when forbidNonWhitelisted is true
    expect(extraRes.body.message).toEqual(expect.arrayContaining(['property extra should not exist']));
  });

  it('a Google-only account posting to /auth/login returns 401 identical to unknown-email 401', async () => {
    const email = `auth-google-e2e-${Date.now()}@example.com`;

    // Create a Google-only account
    fakeVerifier.setNextIdentity({
      sub: 'google-sub-only',
      email,
      emailVerified: true,
      name: 'Google Only',
    });

    await request(app.getHttpServer())
      .post('/api/auth/google')
      .send({ credential: 'fake-token' })
      .expect(200);

    // Try to login with password — should fail with same error as unknown email
    const googleOnlyRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'AnyPassword123' })
      .expect(401);

    // Compare to unknown-email response
    const unknownEmailRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: `nobody-${Date.now()}@example.com`, password: 'AnyPassword123' })
      .expect(401);

    expect(googleOnlyRes.body).toEqual(unknownEmailRes.body);
  });

  it('every error response body contains only camelCase keys', async () => {
    fakeVerifier.throwNext();

    const res = await request(app.getHttpServer())
      .post('/api/auth/google')
      .send({ credential: 'invalid-token' })
      .expect(401);

    // Verify all keys are camelCase (no underscores, PascalCase, or English prose)
    const keys = Object.keys(res.body);
    for (const key of keys) {
      // camelCase starts lowercase and has no underscores
      expect(key).toMatch(/^[a-z][a-zA-Z0-9]*$/);
    }
  });
});
