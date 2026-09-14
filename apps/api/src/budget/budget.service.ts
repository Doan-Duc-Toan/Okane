import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { RATE_PROVIDER, type RateProvider } from '../common/rate-provider.interface.js';
import { GoalsService } from '../goals/goals.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { BudgetMathService, type AvailableBlock, type GoalNeedInput } from './budget-math.service.js';
import type { UpdateBudgetDto } from './dto/update-budget.dto.js';

export interface BudgetSettingsView {
  monthlyIncome: Decimal;
  expenseRent: Decimal;
  expenseFood: Decimal;
  expenseOther: Decimal;
  currency: string;
  updatedAt: Date;
}

/**
 * userId-scoped throughout — every query keys on the unique `userId` column,
 * never on the settings row's own id, so there is no id to tamper with (see
 * phase-03 Security Considerations).
 */
@Injectable()
export class BudgetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly goalsService: GoalsService,
    private readonly budgetMathService: BudgetMathService,
    @Inject(RATE_PROVIDER) private readonly rateProvider: RateProvider,
  ) {}

  async getSettings(userId: string): Promise<{ configured: boolean; settings: BudgetSettingsView | null }> {
    const settings = await this.prisma.budgetSettings.findUnique({ where: { userId } });
    return { configured: !!settings, settings };
  }

  async upsertSettings(
    userId: string,
    dto: UpdateBudgetDto,
  ): Promise<{ configured: true; settings: BudgetSettingsView }> {
    const monthlyIncome = new Decimal(dto.monthlyIncome);
    const expenseRent = new Decimal(dto.expenseRent);
    const expenseFood = new Decimal(dto.expenseFood);
    const expenseOther = new Decimal(dto.expenseOther);

    if (monthlyIncome.isNegative()) {
      throw new BadRequestException('budgetIncomeInvalid');
    }
    if (expenseRent.isNegative() || expenseFood.isNegative() || expenseOther.isNegative()) {
      throw new BadRequestException('budgetExpenseInvalid');
    }

    const data = {
      monthlyIncome: dto.monthlyIncome,
      expenseRent: dto.expenseRent,
      expenseFood: dto.expenseFood,
      expenseOther: dto.expenseOther,
      currency: dto.currency,
    };

    const settings = await this.prisma.budgetSettings.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
    return { configured: true, settings };
  }

  async getAvailable(
    userId: string,
  ): Promise<{ configured: false } | ({ configured: true; rateAsOf: string | null } & AvailableBlock)> {
    const settings = await this.prisma.budgetSettings.findUnique({ where: { userId } });
    if (!settings) return { configured: false };

    const [goals, rate, rateAsOf] = await Promise.all([
      this.goalsService.findAllForUser(userId),
      this.rateProvider.getLatestRate(),
      this.rateProvider.getLatestRateAsOf(),
    ]);

    const goalNeeds: GoalNeedInput[] = goals.map((goal) => ({
      goalId: goal.id,
      name: goal.name,
      currency: goal.currency as GoalNeedInput['currency'],
      suggestedMonthlyAmount: goal.progress.suggestedMonthlyAmount,
      deadline: goal.deadline,
      deadlineStatus: goal.progress.deadlineStatus,
    }));

    const block = this.budgetMathService.computeAvailable({
      monthlyIncome: settings.monthlyIncome,
      expenseRent: settings.expenseRent,
      expenseFood: settings.expenseFood,
      expenseOther: settings.expenseOther,
      budgetCurrency: settings.currency,
      goals: goalNeeds,
      rate,
    });

    return { configured: true, ...block, rateAsOf: block.rateUnavailable ? null : rateAsOf };
  }
}
