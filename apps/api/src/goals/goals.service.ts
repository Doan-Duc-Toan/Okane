import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { RATE_PROVIDER, type RateProvider } from '../common/rate-provider.interface.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateGoalDto } from './dto/create-goal.dto.js';
import type { UpdateGoalDto } from './dto/update-goal.dto.js';
import { GoalMathService, type ProgressBlock } from './goal-math.service.js';

export interface GoalWithProgress {
  id: string;
  name: string;
  targetAmount: Decimal;
  currency: string;
  deadline: Date | null;
  createdAt: Date;
  updatedAt: Date;
  progress: ProgressBlock & { rateAsOf: string | null };
}

/**
 * Every method is scoped by userId per the Phase 2 isolation contract:
 * findFirst({ id, userId }) for reads, updateMany/deleteMany + count check
 * for writes. Never findUnique({ id }) alone — see docs/data-model.md.
 */
@Injectable()
export class GoalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly goalMath: GoalMathService,
    @Inject(RATE_PROVIDER) private readonly rateProvider: RateProvider,
  ) {}

  async create(userId: string, dto: CreateGoalDto) {
    const target = new Decimal(dto.targetAmount);
    if (!target.greaterThan(0)) {
      throw new BadRequestException('targetAmount must be greater than 0');
    }
    const deadline = parseDeadline(dto.deadline);

    return this.prisma.goal.create({
      data: {
        userId,
        name: dto.name,
        targetAmount: dto.targetAmount,
        currency: dto.currency,
        deadline,
      },
    });
  }

  async findAllForUser(userId: string): Promise<GoalWithProgress[]> {
    const [goals, sums, rate, rateAsOf] = await Promise.all([
      this.prisma.goal.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.savingsEntry.groupBy({
        by: ['goalId'],
        where: { userId },
        _sum: { amountInGoalCurrency: true },
      }),
      this.rateProvider.getLatestRate(),
      this.rateProvider.getLatestRateAsOf(),
    ]);

    const savedByGoalId = new Map(sums.map((s) => [s.goalId, s._sum.amountInGoalCurrency ?? new Decimal(0)]));

    return goals.map((goal) => this.attachProgress(goal, savedByGoalId.get(goal.id) ?? new Decimal(0), rate, rateAsOf));
  }

  async findOne(userId: string, id: string): Promise<GoalWithProgress> {
    const goal = await this.prisma.goal.findFirst({ where: { id, userId } });
    if (!goal) throw new NotFoundException('Goal not found');

    const [sum, rate, rateAsOf] = await Promise.all([
      this.prisma.savingsEntry.aggregate({
        where: { goalId: id, userId },
        _sum: { amountInGoalCurrency: true },
      }),
      this.rateProvider.getLatestRate(),
      this.rateProvider.getLatestRateAsOf(),
    ]);

    return this.attachProgress(goal, sum._sum.amountInGoalCurrency ?? new Decimal(0), rate, rateAsOf);
  }

  async update(userId: string, id: string, dto: UpdateGoalDto): Promise<GoalWithProgress> {
    if (dto.targetAmount !== undefined && !new Decimal(dto.targetAmount).greaterThan(0)) {
      throw new BadRequestException('targetAmount must be greater than 0');
    }
    const deadline = dto.deadline !== undefined ? parseDeadline(dto.deadline) : undefined;

    const result = await this.prisma.goal.updateMany({
      where: { id, userId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.targetAmount !== undefined ? { targetAmount: dto.targetAmount } : {}),
        ...(deadline !== undefined ? { deadline } : {}),
      },
    });
    if (result.count === 0) throw new NotFoundException('Goal not found');

    return this.findOne(userId, id);
  }

  async remove(userId: string, id: string): Promise<void> {
    const result = await this.prisma.goal.deleteMany({ where: { id, userId } });
    if (result.count === 0) throw new NotFoundException('Goal not found');
  }

  /** Verifies goal ownership for callers outside this service (e.g. entries). */
  async assertOwned(userId: string, goalId: string): Promise<void> {
    const goal = await this.prisma.goal.findFirst({ where: { id: goalId, userId }, select: { id: true } });
    if (!goal) throw new NotFoundException('Goal not found');
  }

  private attachProgress(
    goal: { targetAmount: Decimal; currency: 'JPY' | 'VND'; deadline: Date | null } & Record<string, unknown>,
    saved: Decimal,
    rate: Decimal | null,
    rateAsOf: string | null,
  ): GoalWithProgress {
    const progress = this.goalMath.computeProgress({
      targetAmount: goal.targetAmount,
      savedAmount: saved,
      currency: goal.currency,
      deadline: goal.deadline,
      today: new Date(),
      rate,
    });
    return { ...goal, progress: { ...progress, rateAsOf } } as GoalWithProgress;
  }
}

function parseDeadline(deadline: string | undefined): Date | null {
  if (!deadline) return null;
  const date = new Date(deadline);
  const todayUtc = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
  const deadlineUtc = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  if (deadlineUtc < todayUtc) {
    throw new BadRequestException('deadline must not be in the past');
  }
  return date;
}
