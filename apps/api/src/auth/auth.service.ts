import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { UsersService, type UserProfile } from '../users/users.service.js';
import { GoogleTokenVerifier } from './google-token.service.js';
import { TokenService, type TokenPair } from './token.service.js';
import type { GoogleLoginDto } from './dto/google-login.dto.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RegisterDto } from './dto/register.dto.js';

export interface AuthResult extends TokenPair {
  user: UserProfile;
}

const BCRYPT_COST = 12;
// Precomputed hash of a value nobody will ever type, so a login against an
// unknown email still pays the cost of one bcrypt compare — otherwise the
// unknown-email path returns faster than the wrong-password path and an
// attacker can enumerate registered emails from response timing alone.
const DUMMY_HASH = '$2b$12$CwTycUXWue0Thq9StjUM0uJ8i6L4Ct8bMBw6kDvMc9E3JG9E8i4uS';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly tokenService: TokenService,
    private readonly googleTokenVerifier: GoogleTokenVerifier,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    const email = dto.email.toLowerCase();
    const existing = await this.usersService.findByEmailWithPassword(email);
    if (existing) {
      throw new ConflictException('emailTaken');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_COST);
    const user = await this.usersService.create(email, passwordHash, dto.displayName);
    const tokens = await this.tokenService.issuePair(user.id, user.email);
    return { ...tokens, user };
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const email = dto.email.toLowerCase();
    const record = await this.usersService.findByEmailWithPassword(email);

    const hashToCompare = record?.passwordHash ?? DUMMY_HASH;
    const passwordMatches = await bcrypt.compare(dto.password, hashToCompare);

    // A Google-only account has no password to match — reject after the compare
    // above, never before it, so the timing stays identical to a wrong password.
    if (!record || !record.passwordHash || !passwordMatches) {
      throw new UnauthorizedException('invalidCredentials');
    }

    const user = await this.usersService.findById(record.id);
    const tokens = await this.tokenService.issuePair(user.id, user.email);
    return { ...tokens, user };
  }

  async loginWithGoogle(dto: GoogleLoginDto): Promise<AuthResult> {
    if (!this.googleTokenVerifier.isConfigured) {
      throw new ServiceUnavailableException('googleNotConfigured');
    }

    const identity = await this.googleTokenVerifier.verify(dto.credential);
    if (!identity.email || !identity.emailVerified) {
      throw new UnauthorizedException('googleEmailUnverified');
    }
    const email = identity.email.toLowerCase();

    const user = await this.resolveGoogleUser(identity.sub, email, identity.name);
    const tokens = await this.tokenService.issuePair(user.id, user.email);
    return { ...tokens, user };
  }

  private async resolveGoogleUser(
    googleId: string,
    email: string,
    name: string | null,
  ): Promise<UserProfile> {
    const byGoogleId = await this.usersService.findByGoogleId(googleId);
    if (byGoogleId) return this.usersService.findById(byGoogleId.id);

    const byEmail = await this.usersService.findByEmailWithPassword(email);
    if (byEmail) {
      if (byEmail.googleId && byEmail.googleId !== googleId) {
        // A different Google account already owns this email — never overwrite.
        throw new UnauthorizedException('googleEmailUnverified');
      }
      if (byEmail.googleId === googleId) return this.usersService.findById(byEmail.id);
      // byEmail.googleId is null here — a password-only account with this
      // verified email. Link, without touching passwordHash or displayName.
      return this.usersService.linkGoogleId(byEmail.id, googleId);
    }

    try {
      return await this.usersService.createWithGoogle(email, googleId, name);
    } catch (err) {
      // Concurrent first-ever sign-in from the same Google account: both requests
      // miss the lookups above and both try to create. Re-run once instead of
      // letting Prisma's global filter turn this into an English-prose 409.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const retryByGoogleId = await this.usersService.findByGoogleId(googleId);
        if (retryByGoogleId) return this.usersService.findById(retryByGoogleId.id);
        const retryByEmail = await this.usersService.findByEmailWithPassword(email);
        if (retryByEmail) return this.usersService.findById(retryByEmail.id);
      }
      throw err;
    }
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    return this.tokenService.rotate(refreshToken);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.tokenService.revoke(refreshToken);
  }
}
