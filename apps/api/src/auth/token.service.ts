import { randomBytes, randomUUID } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service.js';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

interface AccessPayload {
  sub: string;
  email: string;
}

interface RefreshPayload {
  sub: string;
  email: string;
  jti: string;
  s: string;
}

const BCRYPT_COST = 12;

/**
 * Issues, rotates, and revokes JWT pairs. Kept free of controller/request
 * concerns so it unit-tests without a Nest HTTP context (see token.service.spec.ts).
 *
 * Refresh tokens are hashed at rest: the JWT carries an opaque per-token
 * secret (`s`) short enough to never hit bcrypt's 72-byte input limit; only
 * bcrypt(secret) is stored as `tokenHash`. The JWT's `jti` doubles as the
 * RefreshToken row's primary key, so lookup on rotation is a single indexed
 * read rather than an O(n) bcrypt-compare scan across a user's sessions.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async issuePair(userId: string, email: string): Promise<TokenPair> {
    const accessTtl = this.config.get<string>('JWT_ACCESS_TTL', '15m');
    const refreshTtl = this.config.get<string>('JWT_REFRESH_TTL', '30d');

    const accessToken = this.signAccess({ sub: userId, email }, secondsFromDuration(accessTtl));

    const jti = randomUUID();
    const secret = randomBytes(32).toString('base64url');
    const tokenHash = await bcrypt.hash(secret, BCRYPT_COST);
    const expiresAt = new Date(Date.now() + msFromDuration(refreshTtl));

    await this.prisma.refreshToken.create({
      data: { id: jti, userId, tokenHash, expiresAt },
    });

    const refreshToken = this.signRefresh(
      { sub: userId, email, jti, s: secret },
      secondsFromDuration(refreshTtl),
    );

    return { accessToken, refreshToken, expiresIn: secondsFromDuration(accessTtl) };
  }

  /** Verifies, revokes the presented token, and issues a fresh pair. */
  async rotate(refreshToken: string): Promise<TokenPair> {
    const payload = this.verifyRefresh(refreshToken);
    const row = await this.prisma.refreshToken.findUnique({ where: { id: payload.jti } });

    if (!row) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (row.revokedAt) {
      // Reuse of an already-rotated token means it leaked — kill every
      // session for this user, not just this one token.
      await this.revokeAllForUser(row.userId);
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    if (row.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const valid = await bcrypt.compare(payload.s, row.tokenHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    await this.prisma.refreshToken.update({
      where: { id: row.id },
      data: { revokedAt: new Date() },
    });

    return this.issuePair(payload.sub, payload.email);
  }

  /** Idempotent: revoking an already-revoked or unknown token is a no-op. */
  async revoke(refreshToken: string): Promise<void> {
    let payload: RefreshPayload;
    try {
      payload = this.verifyRefresh(refreshToken);
    } catch {
      return;
    }

    await this.prisma.refreshToken.updateMany({
      where: { id: payload.jti, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private signAccess(payload: AccessPayload, expiresInSeconds: number): string {
    return this.jwtService.sign(payload, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: expiresInSeconds,
    });
  }

  private signRefresh(payload: RefreshPayload, expiresInSeconds: number): string {
    return this.jwtService.sign(payload, {
      secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: expiresInSeconds,
    });
  }

  private verifyRefresh(token: string): RefreshPayload {
    try {
      return this.jwtService.verify<RefreshPayload>(token, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
}

/** Parses a jwt-style duration string ("15m", "30d") into milliseconds. */
function msFromDuration(duration: string): number {
  const match = /^(\d+)([smhd])$/.exec(duration);
  if (!match) throw new Error(`Invalid duration format: ${duration}`);
  const value = Number(match[1]);
  const unitMs = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2] as 's' | 'm' | 'h' | 'd'];
  return value * unitMs;
}

function secondsFromDuration(duration: string): number {
  return Math.floor(msFromDuration(duration) / 1000);
}
