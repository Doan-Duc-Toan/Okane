import { Currency } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { describe, expect, it } from 'vitest';
import { convertAmount } from '../common/currency-conversion.js';
import { BudgetMathService, type ComputeAvailableInput, type GoalNeedInput } from './budget-math.service.js';

const RATE = new Decimal('168.43447600');

function goal(overrides: Partial<GoalNeedInput> = {}): GoalNeedInput {
  return {
    goalId: 'goal-1',
    name: 'Goal',
    currency: Currency.JPY,
    suggestedMonthlyAmount: new Decimal('50000'),
    deadline: new Date('2026-12-01T00:00:00.000Z'),
    deadlineStatus: 'on_track',
    ...overrides,
  };
}

function base(overrides: Partial<ComputeAvailableInput> = {}): ComputeAvailableInput {
  return {
    monthlyIncome: new Decimal('300000'),
    expenseRent: new Decimal('100000'),
    expenseFood: new Decimal('50000'),
    expenseOther: new Decimal('20000'),
    budgetCurrency: Currency.JPY,
    goals: [],
    rate: null,
    ...overrides,
  };
}

describe('BudgetMathService', () => {
  const service = new BudgetMathService();

  it('1. no goals -> totalGoalNeed 0, available = pool, allocation null', () => {
    const result = service.computeAvailable(base());
    expect(result.totalGoalNeed?.toString()).toBe('0');
    expect(result.available?.toString()).toBe('130000');
    expect(result.allocation).toBeNull();
  });

  it('2. expenses exceed income -> pool 0, available negative, shortfall = totalGoalNeed', () => {
    const result = service.computeAvailable(
      base({
        monthlyIncome: new Decimal('100000'),
        expenseRent: new Decimal('80000'),
        expenseFood: new Decimal('30000'),
        expenseOther: new Decimal('10000'),
        goals: [goal({ suggestedMonthlyAmount: new Decimal('50000') })],
      }),
    );
    expect(result.totalGoalNeed?.toString()).toBe('50000');
    expect(result.available?.toString()).toBe('-50000');
    expect(result.shortfall?.toString()).toBe(result.totalGoalNeed?.toString());
  });

  it('3. goal with suggestedMonthlyAmount null, status no_deadline -> excluded, contributes 0', () => {
    const result = service.computeAvailable(
      base({ goals: [goal({ suggestedMonthlyAmount: null, deadline: null, deadlineStatus: 'no_deadline' })] }),
    );
    expect(result.excluded).toEqual([{ goalId: 'goal-1', name: 'Goal', reason: 'no_deadline' }]);
    expect(result.counted).toEqual([]);
    expect(result.totalGoalNeed?.toString()).toBe('0');
  });

  it('4. overdue goal (also null) -> excluded reason overdue, not no_deadline', () => {
    const result = service.computeAvailable(
      base({
        goals: [
          goal({
            suggestedMonthlyAmount: null,
            deadline: new Date('2020-01-01T00:00:00.000Z'),
            deadlineStatus: 'overdue',
          }),
        ],
      }),
    );
    expect(result.excluded).toEqual([{ goalId: 'goal-1', name: 'Goal', reason: 'overdue' }]);
  });

  it('5. completed goal (0) -> excluded reason completed', () => {
    const result = service.computeAvailable(
      base({ goals: [goal({ suggestedMonthlyAmount: new Decimal(0), deadlineStatus: 'completed' })] }),
    );
    expect(result.excluded).toEqual([{ goalId: 'goal-1', name: 'Goal', reason: 'completed' }]);
    expect(result.totalGoalNeed?.toString()).toBe('0');
  });

  it('6. all goals same currency as budget -> no conversion, not rateUnavailable', () => {
    const result = service.computeAvailable(
      base({
        budgetCurrency: Currency.JPY,
        goals: [goal({ currency: Currency.JPY, suggestedMonthlyAmount: new Decimal('50000') })],
        rate: null,
      }),
    );
    expect(result.rateUnavailable).toBe(false);
    expect(result.counted[0].needInBudgetCurrency.toString()).toBe('50000');
  });

  it('7. JPY budget + VND goal, rate present -> need divided by rate, ROUND_UP, matches convertAmount', () => {
    const amount = new Decimal('1000000');
    const result = service.computeAvailable(
      base({
        budgetCurrency: Currency.JPY,
        goals: [goal({ currency: Currency.VND, suggestedMonthlyAmount: amount })],
        rate: RATE,
      }),
    );
    const expected = convertAmount(amount, Currency.VND, RATE).toDecimalPlaces(0, Decimal.ROUND_UP);
    expect(result.counted[0].needInBudgetCurrency.toString()).toBe(expected.toString());
    expect(result.rateUsed?.toString()).toBe(RATE.toString());
  });

  it('8. VND budget + JPY goal, rate present -> need multiplied by rate', () => {
    const amount = new Decimal('50000');
    const result = service.computeAvailable(
      base({
        budgetCurrency: Currency.VND,
        monthlyIncome: new Decimal('50000000'),
        expenseRent: new Decimal('0'),
        expenseFood: new Decimal('0'),
        expenseOther: new Decimal('0'),
        goals: [goal({ currency: Currency.JPY, suggestedMonthlyAmount: amount })],
        rate: RATE,
      }),
    );
    const expected = convertAmount(amount, Currency.JPY, RATE).toDecimalPlaces(0, Decimal.ROUND_UP);
    expect(result.counted[0].needInBudgetCurrency.toString()).toBe(expected.toString());
  });

  it('9. mixed currency, rate null -> rateUnavailable true, totals null, excluded still populated', () => {
    const result = service.computeAvailable(
      base({
        budgetCurrency: Currency.JPY,
        goals: [
          goal({ goalId: 'goal-vnd', currency: Currency.VND, suggestedMonthlyAmount: new Decimal('500000') }),
          goal({
            goalId: 'goal-excluded',
            suggestedMonthlyAmount: null,
            deadline: null,
            deadlineStatus: 'no_deadline',
          }),
        ],
        rate: null,
      }),
    );
    expect(result.rateUnavailable).toBe(true);
    expect(result.totalGoalNeed).toBeNull();
    expect(result.available).toBeNull();
    expect(result.shortfall).toBeNull();
    expect(result.counted).toEqual([]);
    expect(result.allocation).toBeNull();
    expect(result.excluded).toEqual([{ goalId: 'goal-excluded', name: 'Goal', reason: 'no_deadline' }]);
  });

  it('10. deadline-less goal only + rate null -> not rateUnavailable, no conversion was needed', () => {
    const result = service.computeAvailable(
      base({
        goals: [goal({ suggestedMonthlyAmount: null, deadline: null, deadlineStatus: 'no_deadline' })],
        rate: null,
      }),
    );
    expect(result.rateUnavailable).toBe(false);
    expect(result.totalGoalNeed?.toString()).toBe('0');
    expect(result.available?.toString()).toBe('130000');
  });

  it('11. need converts to a fraction -> rounded up; totalGoalNeed >= un-rounded sum', () => {
    const amount = new Decimal('100');
    const result = service.computeAvailable(
      base({
        budgetCurrency: Currency.JPY,
        goals: [goal({ currency: Currency.VND, suggestedMonthlyAmount: amount })],
        rate: RATE,
      }),
    );
    const unrounded = convertAmount(amount, Currency.VND, RATE);
    expect(result.counted[0].needInBudgetCurrency.greaterThanOrEqualTo(unrounded)).toBe(true);
    expect(result.totalGoalNeed?.greaterThanOrEqualTo(unrounded)).toBe(true);
    expect(result.counted[0].needInBudgetCurrency.toString()).toBe('1');
  });

  it('12. pool is fractional -> rounded down; sum(allocation) <= pool always', () => {
    const result = service.computeAvailable(
      base({
        monthlyIncome: new Decimal('100000.75'),
        expenseRent: new Decimal('0'),
        expenseFood: new Decimal('0'),
        expenseOther: new Decimal('0'),
        goals: [goal({ suggestedMonthlyAmount: new Decimal('150000') })],
      }),
    );
    expect(result.allocation).not.toBeNull();
    const sum = result.allocation!.reduce((acc, line) => acc.plus(line.amount), new Decimal(0));
    expect(sum.lessThanOrEqualTo(new Decimal('100000.75'))).toBe(true);
    expect(sum.toString()).toBe('100000');
  });

  it('13. shortfall, three goals, distinct deadlines -> allocation ordered nearest-deadline-first', () => {
    const result = service.computeAvailable(
      base({
        monthlyIncome: new Decimal('170000'), // pool = 0
        goals: [
          goal({
            goalId: 'goal-late',
            suggestedMonthlyAmount: new Decimal('30000'),
            deadline: new Date('2027-06-01T00:00:00.000Z'),
          }),
          goal({
            goalId: 'goal-early',
            suggestedMonthlyAmount: new Decimal('40000'),
            deadline: new Date('2026-10-01T00:00:00.000Z'),
          }),
          goal({
            goalId: 'goal-mid',
            suggestedMonthlyAmount: new Decimal('20000'),
            deadline: new Date('2027-01-01T00:00:00.000Z'),
          }),
        ],
      }),
    );
    expect(result.allocation?.map((line) => line.goalId)).toEqual(['goal-early', 'goal-mid', 'goal-late']);
  });

  it('14. two goals with identical deadlines -> tie broken by smaller need, then goalId', () => {
    const sameDeadline = new Date('2027-03-01T00:00:00.000Z');
    const result = service.computeAvailable(
      base({
        monthlyIncome: new Decimal('170000'), // pool = 0
        goals: [
          goal({ goalId: 'goal-b', suggestedMonthlyAmount: new Decimal('10000'), deadline: sameDeadline }),
          goal({ goalId: 'goal-a', suggestedMonthlyAmount: new Decimal('10000'), deadline: sameDeadline }),
          goal({ goalId: 'goal-c', suggestedMonthlyAmount: new Decimal('5000'), deadline: sameDeadline }),
        ],
      }),
    );
    // goal-c has the smallest need -> first. goal-a/goal-b tie on deadline and
    // need, so goalId ascending decides: goal-a before goal-b.
    expect(result.allocation?.map((line) => line.goalId)).toEqual(['goal-c', 'goal-a', 'goal-b']);
  });

  it('15. pool exhausted mid-list -> one partial line, later lines amount 0', () => {
    const result = service.computeAvailable(
      base({
        monthlyIncome: new Decimal('220000'), // pool = 50000
        goals: [
          goal({
            goalId: 'goal-1st',
            suggestedMonthlyAmount: new Decimal('30000'),
            deadline: new Date('2026-10-01T00:00:00.000Z'),
          }),
          goal({
            goalId: 'goal-2nd',
            suggestedMonthlyAmount: new Decimal('30000'),
            deadline: new Date('2026-11-01T00:00:00.000Z'),
          }),
          goal({
            goalId: 'goal-3rd',
            suggestedMonthlyAmount: new Decimal('30000'),
            deadline: new Date('2026-12-01T00:00:00.000Z'),
          }),
        ],
      }),
    );
    const [first, second, third] = result.allocation!;
    expect(first.amount.toString()).toBe('30000');
    expect(first.coveredFully).toBe(true);
    expect(second.amount.toString()).toBe('20000');
    expect(second.coveredFully).toBe(false);
    expect(third.amount.toString()).toBe('0');
    expect(third.coveredFully).toBe(false);
  });

  it('16. pool 0 with unmet needs -> every allocation line is 0, none omitted', () => {
    const result = service.computeAvailable(
      base({
        monthlyIncome: new Decimal('170000'), // pool = 0
        goals: [
          goal({
            goalId: 'goal-x',
            suggestedMonthlyAmount: new Decimal('10000'),
            deadline: new Date('2026-10-01T00:00:00.000Z'),
          }),
          goal({
            goalId: 'goal-y',
            suggestedMonthlyAmount: new Decimal('20000'),
            deadline: new Date('2026-11-01T00:00:00.000Z'),
          }),
        ],
      }),
    );
    expect(result.allocation).toHaveLength(2);
    expect(result.allocation?.every((line) => line.amount.isZero())).toBe(true);
  });

  it('17. no shortfall (available >= 0) -> allocation is null', () => {
    const result = service.computeAvailable(
      base({ goals: [goal({ suggestedMonthlyAmount: new Decimal('50000') })] }),
    );
    expect(result.available?.greaterThanOrEqualTo(0)).toBe(true);
    expect(result.allocation).toBeNull();
  });

  it('18. sum of allocation amounts is always exactly min(pool, totalGoalNeed)', () => {
    const result = service.computeAvailable(
      base({
        monthlyIncome: new Decimal('220000'), // pool = 50000
        goals: [
          goal({
            goalId: 'goal-1st',
            suggestedMonthlyAmount: new Decimal('30000'),
            deadline: new Date('2026-10-01T00:00:00.000Z'),
          }),
          goal({
            goalId: 'goal-2nd',
            suggestedMonthlyAmount: new Decimal('30000'),
            deadline: new Date('2026-11-01T00:00:00.000Z'),
          }),
          goal({
            goalId: 'goal-3rd',
            suggestedMonthlyAmount: new Decimal('30000'),
            deadline: new Date('2026-12-01T00:00:00.000Z'),
          }),
        ],
      }),
    );
    const pool = new Decimal('50000');
    const sum = result.allocation!.reduce((acc, line) => acc.plus(line.amount), new Decimal(0));
    expect(sum.toString()).toBe(Decimal.min(pool, result.totalGoalNeed!).toString());
  });
});
