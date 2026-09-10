import { Injectable, NotFoundException } from '@nestjs/common';
import { Locale, ThemePref } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { UpdateProfileDto } from './dto/update-profile.dto.js';

export interface UserProfile {
  id: string;
  email: string;
  displayName: string | null;
  locale: Locale;
  theme: ThemePref;
}

const PROFILE_SELECT = {
  id: true,
  email: true,
  displayName: true,
  locale: true,
  theme: true,
} as const;

/**
 * Every method that returns to a controller uses the explicit PROFILE_SELECT
 * projection so passwordHash can never leak, by construction rather than by
 * remembering to delete a key afterwards.
 */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Internal only — includes passwordHash for AuthService's credential check. */
  async findByEmailWithPassword(email: string) {
    return this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  }

  async findById(id: string): Promise<UserProfile> {
    const user = await this.prisma.user.findUnique({ where: { id }, select: PROFILE_SELECT });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async create(email: string, passwordHash: string): Promise<UserProfile> {
    return this.prisma.user.create({
      data: { email: email.toLowerCase(), passwordHash },
      select: PROFILE_SELECT,
    });
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<UserProfile> {
    const result = await this.prisma.user.updateMany({ where: { id: userId }, data: dto });
    if (result.count === 0) throw new NotFoundException('User not found');
    return this.findById(userId);
  }
}
