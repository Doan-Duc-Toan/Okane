import { Injectable } from '@nestjs/common';
import { Currency } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { convertAmount } from '../common/currency-conversion.js';

const MS_PER_DAY = 86_400_000;
const DAYS_PER_MONTH = 30.44;

export type DeadlineStatus = 'on_track' | 'overdue' | 'no_deadline' | 'completed';

export interface ComputeProgressInput {
  targetAmount: Decimal;
  savedAmount: Decimal;
  currency: Currency;
  deadline: Date | null;
  today: Date;
  /** JPY -> VND rate, or null when no rate is available. */
  rate: Decimal | null;
}

export interface ProgressBlock {
  savedAmount: Decimal;
  targetAmount: Decimal;
  currency: Currency;
  progressPercent: number;
  remainingAmount: Decimal;
  remainingInOtherCurrency: Decimal | null;
  otherCurrency: Currency;
  rateUsed: Decimal | null;
  monthsRemaining: number | null;
  suggestedMonthlyAmount: Decimal | null;
  deadlineStatus: DeadlineStatus;
}

/**
 * Pure goal-progress math — no Prisma, no HTTP, no ambient clock/rate. Every
 * input the computation needs (today, rate) is passed in explicitly, which is
 * what makes deadline and FX behaviour deterministically unit-testable
 * (see goal-math.service.spec.ts). If a Prisma import ever appears in this
 * file, the design has slipped — see phase-04 plan notes.
 */
@Injectable()
export class GoalMathService {
  computeProgress(input: ComputeProgressInput): ProgressBlock {
    const { targetAmount, savedAmount, currency, deadline, today, rate } = input;
    const otherCurrency = currency === Currency.JPY ? Currency.VND : Currency.JPY;

    const remainingAmount = Decimal.max(0, targetAmount.minus(savedAmount));
    const progressPercent = targetAmount.isZero()
      ? 0
      : Number(savedAmount.dividedBy(targetAmount).times(100).toDecimalPlaces(1));

    const remainingInOtherCurrency = rate ? convertAmount(remainingAmount, currency, rate) : null;

    const monthsRemaining = computeMonthsRemaining(deadline, today);
    const suggestedMonthlyAmount =
      monthsRemaining !== null && !remainingAmount.isZero()
        ? remainingAmount.dividedBy(monthsRemaining).toDecimalPlaces(0, Decimal.ROUND_UP)
        : monthsRemaining !== null
          ? new Decimal(0)
          : null;

    const deadlineStatus = computeDeadlineStatus(savedAmount, targetAmount, deadline, today);

    return {
      savedAmount,
      targetAmount,
      currency,
      progressPercent,
      remainingAmount,
      remainingInOtherCurrency,
      otherCurrency,
      rateUsed: rate,
      monthsRemaining,
      suggestedMonthlyAmount,
      deadlineStatus,
    };
  }
}

function computeMonthsRemaining(deadline: Date | null, today: Date): number | null {
  if (!deadline) return null;
  const deadlineDay = stripTime(deadline);
  const todayDay = stripTime(today);
  if (deadlineDay < todayDay) return null;

  const days = Math.round((deadlineDay - todayDay) / MS_PER_DAY);
  return Math.max(1, Math.ceil(days / DAYS_PER_MONTH));
}

function computeDeadlineStatus(
  saved: Decimal,
  target: Decimal,
  deadline: Date | null,
  today: Date,
): DeadlineStatus {
  if (saved.greaterThanOrEqualTo(target) && target.greaterThan(0)) return 'completed';
  if (!deadline) return 'no_deadline';
  return stripTime(deadline) < stripTime(today) ? 'overdue' : 'on_track';
}

function stripTime(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}
