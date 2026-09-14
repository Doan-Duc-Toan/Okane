import { Injectable } from '@nestjs/common';
import { Currency } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { convertAmount } from '../common/currency-conversion.js';
import type { DeadlineStatus } from '../goals/goal-math.service.js';

export interface GoalNeedInput {
  goalId: string;
  name: string;
  currency: Currency;
  /** Straight from ProgressBlock.suggestedMonthlyAmount. */
  suggestedMonthlyAmount: Decimal | null;
  deadline: Date | null;
  deadlineStatus: DeadlineStatus;
}

export interface ComputeAvailableInput {
  monthlyIncome: Decimal;
  expenseRent: Decimal;
  expenseFood: Decimal;
  expenseOther: Decimal;
  budgetCurrency: Currency;
  goals: GoalNeedInput[];
  /** JPY -> VND rate, or null when no rate is available. */
  rate: Decimal | null;
}

export interface CountedGoalLine {
  goalId: string;
  name: string;
  goalCurrency: Currency;
  needInGoalCurrency: Decimal;
  needInBudgetCurrency: Decimal;
  deadline: Date | null;
}

export interface ExcludedGoalLine {
  goalId: string;
  name: string;
  reason: 'no_deadline' | 'overdue' | 'completed';
}

export interface AllocationLine {
  goalId: string;
  name: string;
  amount: Decimal;
  needInBudgetCurrency: Decimal;
  coveredFully: boolean;
}

export interface AvailableBlock {
  budgetCurrency: Currency;
  monthlyIncome: Decimal;
  totalFixedExpenses: Decimal;
  /** null iff rateUnavailable. */
  totalGoalNeed: Decimal | null;
  /** income - expenses - totalGoalNeed; may be negative. null iff rateUnavailable. */
  available: Decimal | null;
  /** max(0, -available). null iff rateUnavailable. */
  shortfall: Decimal | null;
  counted: CountedGoalLine[];
  excluded: ExcludedGoalLine[];
  rateUsed: Decimal | null;
  rateUnavailable: boolean;
  /** non-null only when shortfall > 0. */
  allocation: AllocationLine[] | null;
}

/** Interim shape before the goal-currency -> budget-currency conversion is resolved. */
interface PendingCountedGoal {
  goalId: string;
  name: string;
  goalCurrency: Currency;
  needInGoalCurrency: Decimal;
  deadline: Date | null;
}

/**
 * Pure budget-allocation math — no Prisma, no HTTP, no ambient clock/rate.
 * Every input the computation needs (goal facts, rate) is passed in
 * explicitly, which is what makes it deterministically unit-testable (see
 * budget-math.service.spec.ts). If a Prisma import ever appears in this file
 * beyond the Currency enum and Decimal type, the design has slipped.
 */
@Injectable()
export class BudgetMathService {
  computeAvailable(input: ComputeAvailableInput): AvailableBlock {
    const { monthlyIncome, expenseRent, expenseFood, expenseOther, budgetCurrency, goals, rate } = input;

    const totalFixedExpenses = expenseRent.plus(expenseFood).plus(expenseOther);
    const pool = Decimal.max(0, monthlyIncome.minus(totalFixedExpenses)).toDecimalPlaces(0, Decimal.ROUND_DOWN);

    const pending: PendingCountedGoal[] = [];
    const excluded: ExcludedGoalLine[] = [];

    for (const goal of goals) {
      if (goal.suggestedMonthlyAmount === null) {
        const reason = goal.deadlineStatus === 'overdue' ? 'overdue' : 'no_deadline';
        excluded.push({ goalId: goal.goalId, name: goal.name, reason });
        continue;
      }
      if (goal.suggestedMonthlyAmount.isZero()) {
        excluded.push({ goalId: goal.goalId, name: goal.name, reason: 'completed' });
        continue;
      }
      pending.push({
        goalId: goal.goalId,
        name: goal.name,
        goalCurrency: goal.currency,
        needInGoalCurrency: goal.suggestedMonthlyAmount,
        deadline: goal.deadline,
      });
    }

    const needsConversion = pending.some((goal) => goal.goalCurrency !== budgetCurrency);
    if (needsConversion && rate === null) {
      return {
        budgetCurrency,
        monthlyIncome,
        totalFixedExpenses,
        totalGoalNeed: null,
        available: null,
        shortfall: null,
        counted: [],
        excluded,
        rateUsed: null,
        rateUnavailable: true,
        allocation: null,
      };
    }

    const counted: CountedGoalLine[] = pending.map((goal) => {
      const needInBudgetCurrency = (
        goal.goalCurrency === budgetCurrency
          ? goal.needInGoalCurrency
          : convertAmount(goal.needInGoalCurrency, goal.goalCurrency, rate as Decimal)
      ).toDecimalPlaces(0, Decimal.ROUND_UP);
      return { ...goal, needInBudgetCurrency };
    });

    const totalGoalNeed = counted.reduce((sum, goal) => sum.plus(goal.needInBudgetCurrency), new Decimal(0));
    const available = pool.minus(totalGoalNeed);
    const shortfall = Decimal.max(0, available.negated());

    return {
      budgetCurrency,
      monthlyIncome,
      totalFixedExpenses,
      totalGoalNeed,
      available,
      shortfall,
      counted,
      excluded,
      rateUsed: rate,
      rateUnavailable: false,
      allocation: shortfall.isZero() ? null : allocate(pool, counted),
    };
  }
}

/**
 * Greedy nearest-deadline-first allocation of `pool` across `lines`. Exported
 * separately (module-level, not a class method) so it is unit-testable on its
 * own — mirrors computeMonthsRemaining in goal-math.service.ts.
 *
 * Sort order is a total order (deadline asc -> need asc -> goalId asc) so
 * output is deterministic even when deadlines tie. Every line is emitted,
 * including zero-amount lines once the pool is exhausted.
 */
export function allocate(pool: Decimal, lines: CountedGoalLine[]): AllocationLine[] {
  const sorted = [...lines].sort((a, b) => {
    const deadlineDiff = deadlineTime(a.deadline) - deadlineTime(b.deadline);
    if (deadlineDiff !== 0) return deadlineDiff;
    const needDiff = a.needInBudgetCurrency.comparedTo(b.needInBudgetCurrency);
    if (needDiff !== 0) return needDiff;
    return a.goalId.localeCompare(b.goalId);
  });

  let poolLeft = pool;
  const result: AllocationLine[] = [];
  for (const line of sorted) {
    const give = Decimal.min(line.needInBudgetCurrency, poolLeft);
    poolLeft = poolLeft.minus(give);
    result.push({
      goalId: line.goalId,
      name: line.name,
      amount: give,
      needInBudgetCurrency: line.needInBudgetCurrency,
      coveredFully: give.equals(line.needInBudgetCurrency),
    });
  }
  return result;
}

function deadlineTime(deadline: Date | null): number {
  return deadline ? deadline.getTime() : Number.POSITIVE_INFINITY;
}
