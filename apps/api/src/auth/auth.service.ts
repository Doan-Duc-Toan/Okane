import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersService, type UserProfile } from '../users/users.service.js';
import { TokenService, type TokenPair } from './token.service.js';
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

    if (!record || !passwordMatches) {
      throw new UnauthorizedException('invalidCredentials');
    }

    const user = await this.usersService.findById(record.id);
    const tokens = await this.tokenService.issuePair(user.id, user.email);
    return { ...tokens, user };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    return this.tokenService.rotate(refreshToken);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.tokenService.revoke(refreshToken);
  }
}
