import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';
import { TokenService } from './token.service.js';

interface FakeRow {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

/**
 * In-memory stand-in for the subset of PrismaService.refreshToken used by
 * TokenService, so this suite unit-tests real rotation/reuse logic without a
 * database — the whole point of keeping TokenService free of HTTP/Nest
 * request concerns.
 */
class FakeRefreshTokenStore {
  rows = new Map<string, FakeRow>();

  refreshToken = {
    create: async ({ data }: { data: Omit<FakeRow, 'revokedAt'> }) => {
      const row: FakeRow = { ...data, revokedAt: null };
      this.rows.set(row.id, row);
      return row;
    },
    findUnique: async ({ where: { id } }: { where: { id: string } }) => this.rows.get(id) ?? null,
    update: async ({ where: { id }, data }: { where: { id: string }; data: Partial<FakeRow> }) => {
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
      data: Partial<FakeRow>;
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

function buildTokenService() {
  const config = new ConfigService({
    JWT_ACCESS_SECRET: 'unit-test-access-secret-unit-test-access-secret',
    JWT_REFRESH_SECRET: 'unit-test-refresh-secret-unit-test-refresh-secret',
    JWT_ACCESS_TTL: '15m',
    JWT_REFRESH_TTL: '30d',
  });
  const jwt = new JwtService();
  const store = new FakeRefreshTokenStore();
  // Cast: FakeRefreshTokenStore intentionally implements only the slice of
  // PrismaService that TokenService touches.
  const tokenService = new TokenService(jwt, config, store as never);
  return { tokenService, store };
}

describe('TokenService', () => {
  let tokenService: TokenService;

  beforeEach(() => {
    ({ tokenService } = buildTokenService());
  });

  it('issues an access + refresh pair with the expected shape', async () => {
    const pair = await tokenService.issuePair('user-1', 'user@example.com');
    expect(pair.accessToken).toEqual(expect.any(String));
    expect(pair.refreshToken).toEqual(expect.any(String));
    expect(pair.expiresIn).toBe(15 * 60);
  });

  it('rotation revokes the predecessor and issues a new working pair', async () => {
    const first = await tokenService.issuePair('user-1', 'user@example.com');
    const second = await tokenService.rotate(first.refreshToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);

    // The new pair keeps working through further legitimate rotations.
    const third = await tokenService.rotate(second.refreshToken);
    expect(third.accessToken).toEqual(expect.any(String));
  });

  it('the predecessor token is rejected once rotated away', async () => {
    const first = await tokenService.issuePair('user-1', 'user@example.com');
    await tokenService.rotate(first.refreshToken);

    await expect(tokenService.rotate(first.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('reusing a revoked (rotated-away) token revokes the whole family', async () => {
    const first = await tokenService.issuePair('user-1', 'user@example.com');
    const second = await tokenService.rotate(first.refreshToken);

    // Reuse of `first` after rotation is the classic theft signal.
    await expect(tokenService.rotate(first.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);

    // `second`, though never presented twice, must also be dead now.
    await expect(tokenService.rotate(second.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an expired refresh token', async () => {
    const { tokenService: shortLivedService } = (() => {
      const config = new ConfigService({
        JWT_ACCESS_SECRET: 'unit-test-access-secret-unit-test-access-secret',
        JWT_REFRESH_SECRET: 'unit-test-refresh-secret-unit-test-refresh-secret',
        JWT_ACCESS_TTL: '15m',
        JWT_REFRESH_TTL: '1s',
      });
      const jwt = new JwtService();
      const store = new FakeRefreshTokenStore();
      return { tokenService: new TokenService(jwt, config, store as never) };
    })();

    const pair = await shortLivedService.issuePair('user-1', 'user@example.com');
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await expect(shortLivedService.rotate(pair.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('logout revokes the token and a second logout is a harmless no-op', async () => {
    const pair = await tokenService.issuePair('user-1', 'user@example.com');
    await tokenService.revoke(pair.refreshToken);
    await expect(tokenService.revoke(pair.refreshToken)).resolves.toBeUndefined();
    await expect(tokenService.rotate(pair.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
