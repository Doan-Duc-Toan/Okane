import { Currency } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { describe, expect, it } from 'vitest';
import { GoalMathService } from './goal-math.service.js';

const TODAY = new Date('2026-09-10T00:00:00.000Z');
const RATE = new Decimal('168.43447600');

function base(overrides: Partial<Parameters<GoalMathService['computeProgress']>[0]> = {}) {
  return {
    targetAmount: new Decimal('1500000.00'),
    savedAmount: new Decimal('0.00'),
    currency: Currency.JPY,
    deadline: null,
    today: TODAY,
    rate: null,
    ...overrides,
  };
}

describe('GoalMathService', () => {
  const service = new GoalMathService();

  it('zero saved -> 0% progress and full remaining amount', () => {
    const result = service.computeProgress(base({ savedAmount: new Decimal('0.00') }));
    expect(result.progressPercent).toBe(0);
    expect(result.remainingAmount.toString()).toBe('1500000');
    expect(result.deadlineStatus).toBe('no_deadline');
  });

  it('exactly 100% -> completed, zero remaining', () => {
    const result = service.computeProgress(base({ savedAmount: new Decimal('1500000.00') }));
    expect(result.progressPercent).toBe(100);
    expect(result.remainingAmount.toString()).toBe('0');
    expect(result.deadlineStatus).toBe('completed');
  });

  it('over 100% -> true percentage is not clamped, remaining floors at 0', () => {
    const result = service.computeProgress(base({ savedAmount: new Decimal('2000000.00') }));
    expect(result.progressPercent).toBeCloseTo(133.3, 1);
    expect(result.remainingAmount.toString()).toBe('0');
    expect(result.deadlineStatus).toBe('completed');
  });

  it('no deadline -> monthsRemaining and suggestedMonthlyAmount are null', () => {
    const result = service.computeProgress(base({ savedAmount: new Decimal('450000.00'), deadline: null }));
    expect(result.monthsRemaining).toBeNull();
    expect(result.suggestedMonthlyAmount).toBeNull();
    expect(result.deadlineStatus).toBe('no_deadline');
  });

  it('deadline today -> 1 month remaining, on_track', () => {
    const result = service.computeProgress(
      base({ savedAmount: new Decimal('450000.00'), deadline: new Date('2026-09-10T00:00:00.000Z') }),
    );
    expect(result.monthsRemaining).toBe(1);
    expect(result.deadlineStatus).toBe('on_track');
  });

  it('deadline passed -> monthsRemaining null, status overdue', () => {
    const result = service.computeProgress(
      base({ savedAmount: new Decimal('450000.00'), deadline: new Date('2026-01-01T00:00:00.000Z') }),
    );
    expect(result.monthsRemaining).toBeNull();
    expect(result.suggestedMonthlyAmount).toBeNull();
    expect(result.deadlineStatus).toBe('overdue');
  });

  it('target reached early (deadline still in the future) -> completed takes precedence', () => {
    const result = service.computeProgress(
      base({ savedAmount: new Decimal('1600000.00'), deadline: new Date('2027-01-01T00:00:00.000Z') }),
    );
    expect(result.deadlineStatus).toBe('completed');
  });

  it('a 10-month deadline with 1,050,000 remaining suggests 105,000/month', () => {
    const tenMonthsOut = new Date(TODAY);
    tenMonthsOut.setUTCMonth(tenMonthsOut.getUTCMonth() + 10);
    const result = service.computeProgress(
      base({
        targetAmount: new Decimal('1500000.00'),
        savedAmount: new Decimal('450000.00'),
        deadline: tenMonthsOut,
      }),
    );
    expect(result.monthsRemaining).toBe(10);
    expect(result.suggestedMonthlyAmount?.toString()).toBe('105000');
  });

  it('null rate -> cross-currency fields are null, not zero or a stale guess', () => {
    const result = service.computeProgress(base({ savedAmount: new Decimal('450000.00'), rate: null }));
    expect(result.remainingInOtherCurrency).toBeNull();
    expect(result.rateUsed).toBeNull();
  });

  it('JPY goal remaining converts to VND using the injected rate', () => {
    const result = service.computeProgress(
      base({ currency: Currency.JPY, savedAmount: new Decimal('0.00'), rate: RATE }),
    );
    expect(result.otherCurrency).toBe(Currency.VND);
    expect(result.remainingInOtherCurrency?.toString()).toBe(
      new Decimal('1500000.00').times(RATE).toDecimalPlaces(2).toString(),
    );
  });

  it('VND goal remaining converts to JPY using the injected rate (round-trip within tolerance)', () => {
    const result = service.computeProgress(
      base({
        targetAmount: new Decimal('30000000.00'),
        currency: Currency.VND,
        savedAmount: new Decimal('0.00'),
        rate: RATE,
      }),
    );
    expect(result.otherCurrency).toBe(Currency.JPY);
    const expectedJpy = new Decimal('30000000.00').dividedBy(RATE).toDecimalPlaces(2);
    expect(result.remainingInOtherCurrency?.toString()).toBe(expectedJpy.toString());

    // Round-trip: converting back to VND at the same rate lands within a
    // rounding-tolerance of the original amount (a couple of cents at most).
    const roundTripped = expectedJpy.times(RATE);
    expect(roundTripped.minus('30000000.00').abs().lessThan('1')).toBe(true);
  });

  it('handles values that break naive float arithmetic (0.1 + 0.2)', () => {
    const result = service.computeProgress(
      base({
        targetAmount: new Decimal('0.30'),
        savedAmount: new Decimal('0.10').plus('0.20'),
      }),
    );
    expect(result.remainingAmount.toString()).toBe('0');
    expect(result.progressPercent).toBe(100);
  });
});
