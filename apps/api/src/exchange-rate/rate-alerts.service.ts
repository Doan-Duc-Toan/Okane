import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateAlertDto } from './dto/create-alert.dto.js';
import type { UpdateAlertDto } from './dto/update-alert.dto.js';

const MAX_ALERTS_PER_USER = 10;

/**
 * User-scoped per the Phase 2 isolation contract (findFirst/updateMany/
 * deleteMany + userId, 404 on foreign rows). Capped per user so one account
 * can't grow the list the daily cron evaluates without bound.
 */
@Injectable()
export class RateAlertsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateAlertDto) {
    const threshold = new Decimal(dto.threshold);
    if (!threshold.greaterThan(0)) {
      throw new BadRequestException('threshold must be greater than 0');
    }

    const count = await this.prisma.rateAlert.count({ where: { userId } });
    if (count >= MAX_ALERTS_PER_USER) {
      throw new BadRequestException(`Maximum of ${MAX_ALERTS_PER_USER} alerts per account`);
    }

    return this.prisma.rateAlert.create({
      data: {
        userId,
        direction: dto.direction,
        threshold: dto.threshold,
        active: dto.active ?? true,
      },
    });
  }

  findAllForUser(userId: string) {
    return this.prisma.rateAlert.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }

  async update(userId: string, id: string, dto: UpdateAlertDto) {
    if (dto.threshold !== undefined && !new Decimal(dto.threshold).greaterThan(0)) {
      throw new BadRequestException('threshold must be greater than 0');
    }

    const result = await this.prisma.rateAlert.updateMany({
      where: { id, userId },
      data: {
        ...(dto.direction !== undefined ? { direction: dto.direction } : {}),
        ...(dto.threshold !== undefined ? { threshold: dto.threshold } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });
    if (result.count === 0) throw new NotFoundException('Alert not found');

    return this.prisma.rateAlert.findFirst({ where: { id, userId } });
  }

  async remove(userId: string, id: string): Promise<void> {
    const result = await this.prisma.rateAlert.deleteMany({ where: { id, userId } });
    if (result.count === 0) throw new NotFoundException('Alert not found');
  }
}
