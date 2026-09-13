import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from './auth.service.js';
import { TokenService } from './token.service.js';
import type { GoogleIdentity } from './google-token.service.js';

interface FakeUser {
  id: string;
  email: string;
  passwordHash: string | null;
  googleId: string | null;
  displayName: string | null;
}

interface FakeRefreshToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

/**
 * In-memory stand-in for the subset of PrismaService.user used by AuthService,
 * so this suite unit-tests real Google linking/creation logic without a
 * database — the whole point of keeping AuthService's user resolution logic
 * testable without hitting Postgres.
 */
class FakeUsersStore {
  rows = new Map<string, FakeUser>();
  private idCounter = 1;

  findByEmailWithPassword = async (email: string) =>
    Array.from(this.rows.values()).find((u) => u.email === email) ?? null;

  findById = async (id: string) => {
    const user = this.rows.get(id);
    if (!user) throw new Error('not found');
    return user;
  };

  findByGoogleId = async (googleId: string) =>
    Array.from(this.rows.values()).find((u) => u.googleId === googleId) ?? null;

  linkGoogleId = async (userId: string, googleId: string) => {
    const user = this.rows.get(userId);
    if (!user) throw new Error('not found');
    user.googleId = googleId;
    return user;
  };

  createWithGoogle = async (email: string, googleId: string, displayName: string | null) => {
    const id = `user-${this.idCounter++}`;
    const user: FakeUser = { id, email, passwordHash: null, googleId, displayName };
    this.rows.set(id, user);
    return user;
  };

  create = async (email: string, passwordHash: string, displayName?: string) => {
    const id = `user-${this.idCounter++}`;
    const user: FakeUser = { id, email, passwordHash, googleId: null, displayName: displayName ?? null };
    this.rows.set(id, user);
    return user;
  };
}

/**
 * In-memory stand-in for TokenService so unit tests don't need JWT/Postgres.
 */
class FakeTokenStore {
  rows = new Map<string, FakeRefreshToken>();

  refreshToken = {
    create: async ({ data }: { data: Omit<FakeRefreshToken, 'revokedAt'> }) => {
      const row: FakeRefreshToken = { ...data, revokedAt: null };
      this.rows.set(row.id, row);
      return row;
    },
    findUnique: async ({ where: { id } }: { where: { id: string } }) => this.rows.get(id) ?? null,
    update: async ({ where: { id }, data }: { where: { id: string }; data: Partial<FakeRefreshToken> }) => {
      const row = this.rows.get(id);
      if (!row) throw new Error('not found');
      Object.assign(row, data);
      return row;
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: { userId?: string; id?: string; revokedAt?: null };
      data: Partial<FakeRefreshToken>;
    }) => {
      let count = 0;
      for (const row of this.rows.values()) {
        const userMatches = where.userId === undefined || row.userId === where.userId;
        const idMatches = where.id === undefined || row.id === where.id;
        const revokedMatches = where.revokedAt === undefined || row.revokedAt === where.revokedAt;
        if (userMatches && idMatches && revokedMatches) {
          Object.assign(row, data);
          count += 1;
        }
      }
      return { count };
    },
  };
}

/**
 * In-memory stand-in for GoogleTokenVerifier so unit tests don't need real
 * tokens or network access. Supports both successful verification and
 * configurable failures.
 */
class FakeGoogleVerifier {
  isConfigured = true;
  private _throwNext = false;
  private _nextIdentity: GoogleIdentity | null = null;

  setThrowNext(shouldThrow: boolean) {
    this._throwNext = shouldThrow;
  }

  setNextIdentity(identity: GoogleIdentity) {
    this._nextIdentity = identity;
  }

  verify = async (_credential: string): Promise<GoogleIdentity> => {
    if (this._throwNext) {
      throw new UnauthorizedException('googleTokenInvalid');
    }
    if (!this._nextIdentity) {
      throw new Error('no identity configured in fake');
    }
    return this._nextIdentity;
  };
}

function buildAuthService() {
  const users = new FakeUsersStore();
  const tokens = new FakeTokenStore();
  const verifier = new FakeGoogleVerifier();

  // Cast: FakeTokenStore intentionally implements only the slice of
  // PrismaService that TokenService touches.
  const tokenService = new TokenService(
    { sign: (payload: any) => Promise.resolve(`token-${JSON.stringify(payload)}`) } as any,
    {
      get: (key: string) => {
        if (key === 'JWT_ACCESS_TTL') return '15m';
        if (key === 'JWT_REFRESH_TTL') return '30d';
        if (key === 'JWT_ACCESS_SECRET') return 'test-access-secret-test-access-secret';
        if (key === 'JWT_REFRESH_SECRET') return 'test-refresh-secret-test-refresh-secret';
        return undefined;
      },
    } as any,
    tokens as never,
  );

  // Cast: FakeUsersStore intentionally implements only the slice of
  // UsersService that AuthService touches. Same for verifier.
  const authService = new AuthService(users as never, tokenService, verifier as never);
  return { authService, users, verifier, tokenService };
}

describe('AuthService.loginWithGoogle', () => {
  let authService: AuthService;
  let users: FakeUsersStore;
  let verifier: FakeGoogleVerifier;

  beforeEach(() => {
    ({ authService, users, verifier } = buildAuthService());
  });

  it('creates a new user with googleId, null passwordHash, and displayName from Google', async () => {
    verifier.setNextIdentity({
      sub: 'google-123',
      email: 'newuser@example.com',
      emailVerified: true,
      name: 'New User',
    });

    const result = await authService.loginWithGoogle({ credential: 'fake-token' });

    expect(result.user.email).toBe('newuser@example.com');
    expect(result.user.displayName).toBe('New User');
    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();

    const stored = Array.from(users.rows.values()).find((u) => u.email === 'newuser@example.com');
    expect(stored).toBeDefined();
    expect(stored!.googleId).toBe('google-123');
    expect(stored!.passwordHash).toBeNull();
  });

  it('returns the same user id when the googleId already exists', async () => {
    // Create a user directly with a googleId
    const existing = await (users as any).createWithGoogle('existing@example.com', 'google-456', 'Existing');
    const existingId = existing.id;

    verifier.setNextIdentity({
      sub: 'google-456',
      email: 'existing@example.com',
      emailVerified: true,
      name: 'Updated Name',
    });

    const result = await authService.loginWithGoogle({ credential: 'fake-token' });

    expect(result.user.id).toBe(existingId);
    // Should not create a second row
    expect(users.rows.size).toBe(1);
  });

  it('links to an existing password-only account when Google reports verified email', async () => {
    // Create a password-only account
    const passwordUser = await (users as any).create('linked@example.com', 'hashed-pw', 'Password User');
    const userId = passwordUser.id;

    verifier.setNextIdentity({
      sub: 'google-789',
      email: 'linked@example.com',
      emailVerified: true,
      name: 'Google Name',
    });

    const result = await authService.loginWithGoogle({ credential: 'fake-token' });

    expect(result.user.id).toBe(userId);
    // Should not create a second row, only link
    expect(users.rows.size).toBe(1);

    const updated = users.rows.get(userId);
    expect(updated!.googleId).toBe('google-789');
    // passwordHash and displayName must remain unchanged
    expect(updated!.passwordHash).toBe('hashed-pw');
    expect(updated!.displayName).toBe('Password User');
  });

  it('rejects unverified email and creates no user row', async () => {
    const sizeBefore = users.rows.size;

    verifier.setNextIdentity({
      sub: 'google-999',
      email: 'unverified@example.com',
      emailVerified: false,
      name: 'Unverified User',
    });

    await expect(authService.loginWithGoogle({ credential: 'fake-token' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    // No user was created
    expect(users.rows.size).toBe(sizeBefore);
  });

  it('rejects missing email and creates no user row', async () => {
    const sizeBefore = users.rows.size;

    verifier.setNextIdentity({
      sub: 'google-888',
      email: null,
      emailVerified: true,
      name: 'No Email User',
    });

    await expect(authService.loginWithGoogle({ credential: 'fake-token' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    // No user was created
    expect(users.rows.size).toBe(sizeBefore);
  });

  it('rejects an invalid or expired token and creates no user row', async () => {
    const sizeBefore = users.rows.size;

    verifier.setThrowNext(true);

    await expect(authService.loginWithGoogle({ credential: 'bad-token' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    // No user was created
    expect(users.rows.size).toBe(sizeBefore);
  });

  it('rejects when an existing account is already linked to a different googleId', async () => {
    // Create an account already linked to a different Google account
    const existing = await (users as any).createWithGoogle('taken@example.com', 'google-old', 'Old Google');

    verifier.setNextIdentity({
      sub: 'google-new',
      email: 'taken@example.com',
      emailVerified: true,
      name: 'New Google',
    });

    await expect(authService.loginWithGoogle({ credential: 'fake-token' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    // The googleId must not be overwritten
    const stored = users.rows.get(existing.id);
    expect(stored!.googleId).toBe('google-old');
  });

  it('rejects when Google verification is not configured', async () => {
    verifier.isConfigured = false;

    // The error must be thrown before verify() is called
    const verifyCallCount = { count: 0 };
    const originalVerify = verifier.verify;
    verifier.verify = async () => {
      verifyCallCount.count++;
      return originalVerify.call(verifier);
    };

    await expect(authService.loginWithGoogle({ credential: 'fake-token' })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    // Verify was never called
    expect(verifyCallCount.count).toBe(0);
  });
});

describe('AuthService.login', () => {
  let authService: AuthService;
  let users: FakeUsersStore;

  beforeEach(() => {
    ({ authService, users } = buildAuthService());
  });

  it('rejects a login attempt against a Google-only account (passwordHash = null)', async () => {
    // Create a Google-only account
    await (users as any).createWithGoogle('googleonly@example.com', 'google-111', 'Google Only');

    await expect(
      authService.login({ email: 'googleonly@example.com', password: 'SomePassword123' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('supports traditional password-based register and login', async () => {
    const email = 'password@example.com';
    const password = 'CorrectPassword123';

    const registerResult = await authService.register({
      email,
      password,
      displayName: 'Password User',
    });

    expect(registerResult.user.email).toBe(email);
    expect(registerResult.user.displayName).toBe('Password User');
    expect(registerResult.accessToken).toBeDefined();
    expect(registerResult.refreshToken).toBeDefined();

    // Verify the user can log in with the same password
    const loginResult = await authService.login({ email, password });
    expect(loginResult.user.email).toBe(email);
    expect(loginResult.accessToken).toBeDefined();
  });
});
