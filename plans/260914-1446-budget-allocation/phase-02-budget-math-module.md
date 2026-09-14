# Phase 2 — Pure `BudgetMathService` + unit tests

## Context Links
- [plan.md](plan.md) · [phase-03 (only consumer)](phase-03-backend-budget-endpoints.md)
- Pattern to mirror: `apps/api/src/goals/goal-math.service.ts` + `goal-math.service.spec.ts`
- `apps/api/src/common/currency-conversion.ts` — `convertAmount(amount, fromCurrency, jpyToVndRate)`
- `DeadlineStatus` / `ProgressBlock` from `apps/api/src/goals/goal-math.service.ts`

## Overview
- **Priority:** P1 (highest-value, cheapest to prove) · **Status:** DONE · **Effort:** 1.5h
- The available-balance and allocation-suggestion arithmetic, as a pure service: no Prisma, no HTTP,
  no ambient clock, no rate lookup. Rate and goal facts are passed in. This phase is independent of
  Phase 1 and can start immediately.

## Key Insights
- **The `null` in `suggestedMonthlyAmount` is already the filter we need.** `GoalMathService` returns
  `null` when `monthsRemaining` is null, which happens for *both* a deadline-less goal and an overdue
  goal (`computeMonthsRemaining` returns null once the deadline is in the past). A completed goal
  returns `0`. So: **count a goal iff `suggestedMonthlyAmount != null && > 0`.** No new "active"
  predicate is invented; `deadlineStatus` is carried only to *explain* an exclusion to the user.
- **A deadline-less goal is excluded, deliberately.** There is no month to spread its remainder over.
  Any monthly figure we produced would be fabricated. It is listed under `excluded` with reason
  `no_deadline` so the user can fix it by setting a deadline — the fix is visible, not hidden.
- **Convert per goal, then sum — never sum then convert.** `convertAmount` rounds to 2dp; summing
  first in mixed currencies is meaningless. Converting per goal also gives the per-goal breakdown
  line the UI needs for free.
- **`convertAmount(x, from, rate)` converts to *the other* currency** — correct here only because
  there are exactly two. Call it only when `goalCurrency !== budgetCurrency`.
- **Allocation output is denominated in the budget currency**, which means it maps 1:1 onto split
  allocations with `currency: budgetCurrency` and the server freezes each goal's
  `amountInGoalCurrency` on submit. No back-conversion anywhere in this module.

## Requirements
**Functional**
- Given income, three expense totals, a budget currency, every goal's monthly ask, and a rate:
  return total need, available (may be negative), the counted breakdown, the excluded list with
  reasons, and — only when the need overruns — a suggested split.
- Rounding must never suggest more than the user has.
- Missing rate when a conversion is required must be reported, not thrown and not silently skipped.

**Non-functional**
- Zero imports from `@prisma/client` other than the `Currency` enum and `Decimal` type (exactly what
  `goal-math.service.ts` imports today). **If `PrismaService` ever appears in this file the design
  has slipped** — same guard comment as `goal-math.service.ts` carries.
- Deterministic: same inputs → same outputs, always.

## Architecture
`apps/api/src/budget/budget-math.service.ts`

```ts
export interface GoalNeedInput {
  goalId: string;
  name: string;
  currency: Currency;
  suggestedMonthlyAmount: Decimal | null;   // straight from ProgressBlock
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
  rate: Decimal | null;                     // JPY -> VND, or null
}

export interface CountedGoalLine {
  goalId: string; name: string;
  goalCurrency: Currency;
  needInGoalCurrency: Decimal;
  needInBudgetCurrency: Decimal;            // integer
  deadline: Date | null;
}

export interface ExcludedGoalLine {
  goalId: string; name: string;
  reason: 'no_deadline' | 'overdue' | 'completed';
}

export interface AllocationLine {
  goalId: string; name: string;
  amount: Decimal;                          // integer, budget currency
  needInBudgetCurrency: Decimal;
  coveredFully: boolean;
}

export interface AvailableBlock {
  budgetCurrency: Currency;
  monthlyIncome: Decimal;
  totalFixedExpenses: Decimal;
  totalGoalNeed: Decimal | null;            // null iff rateUnavailable
  available: Decimal | null;                // income - expenses - totalGoalNeed; may be negative
  shortfall: Decimal | null;                // max(0, -available)
  counted: CountedGoalLine[];
  excluded: ExcludedGoalLine[];
  rateUsed: Decimal | null;
  rateUnavailable: boolean;
  allocation: AllocationLine[] | null;      // non-null only when shortfall > 0
}
```

**Algorithm**
1. `totalFixedExpenses = rent + food + other`.
   `pool = max(0, income − totalFixedExpenses).toDecimalPlaces(0, ROUND_DOWN)` — rounding the pool
   *down* is the first half of "never suggest more than the user has".
2. Partition goals:
   - `suggestedMonthlyAmount == null` → excluded, reason from `deadlineStatus`
     (`no_deadline` / `overdue`).
   - `suggestedMonthlyAmount` is `0` → excluded, reason `completed`. (A finished goal has no ask;
     listing it as a zero line is noise.)
   - otherwise → counted.
3. For each counted goal: `needInBudgetCurrency = goalCurrency === budgetCurrency ? need :
   convertAmount(need, goalCurrency, rate)`, then `.toDecimalPlaces(0, ROUND_UP)` — rounding a need
   *up* is the second half; it can only make the picture more conservative.
   If any counted goal needs conversion and `rate === null` → return early with
   `rateUnavailable: true`, `totalGoalNeed/available/shortfall/allocation = null`, `counted: []`.
   The `excluded` list and income/expense totals are still returned — they need no rate.
4. `totalGoalNeed = Σ needInBudgetCurrency`; `available = pool − totalGoalNeed`;
   `shortfall = max(0, −available)`.
5. `allocation = shortfall.isZero() ? null : allocate(pool, sortedCounted)`.

**`allocate(pool, lines)`** — exported separately so it is unit-testable on its own:
sort by `deadline` ascending → smaller `needInBudgetCurrency` → `goalId` ascending (a total order,
so output is deterministic for identical deadlines). Walk the sorted list:
`give = Decimal.min(need, poolLeft)`, `poolLeft −= give`, `coveredFully = give.equals(need)`.
Every line is emitted, including the zero ones after the pool is exhausted — the UI must be able to
show *"these goals get nothing this month"*, which is the most useful thing the suggestion says.

**Why greedy nearest-deadline, not proportional:** a deadline is a hard constraint and a proportional
split misses every one of them a little; nearest-first saves the goals that can still be saved and
tells the truth about the rest. Proportional is a mode nobody asked for (YAGNI).

## Related Code Files
**Create:**
- `apps/api/src/budget/budget-math.service.ts`
- `apps/api/src/budget/budget-math.service.spec.ts`

**Read for context:** `apps/api/src/goals/goal-math.service.ts`, `goal-math.service.spec.ts`,
`apps/api/src/common/currency-conversion.ts`
**Modify / Delete:** none — nothing imports this file until Phase 3.

## Implementation Steps
1. Create `apps/api/src/budget/budget-math.service.ts` with the interfaces above and an
   `@Injectable() class BudgetMathService { computeAvailable(input): AvailableBlock }`.
2. Implement `allocate` as a module-level exported function (not a class method) — it has no
   dependency on `this`, same shape as `computeMonthsRemaining` in `goal-math.service.ts`.
3. Carry the "no Prisma in this file" guard comment from `goal-math.service.ts`, pointing here.
4. Write `budget-math.service.spec.ts` following house style: a `base(overrides)` factory, fixed
   `RATE = new Decimal('168.43447600')`, plain `vitest` with no mocking framework.
5. `pnpm --filter @okane/api test` and `pnpm --filter @okane/api lint`.

## Test Matrix (unit — this is where the bugs actually are)
| # | Case | Expectation |
|---|---|---|
| 1 | No goals | `totalGoalNeed = 0`, `available = pool`, `allocation = null` |
| 2 | Expenses > income | `pool = 0`, `available` negative, `shortfall = totalGoalNeed` |
| 3 | Goal with `suggestedMonthlyAmount = null`, status `no_deadline` | excluded w/ reason, contributes 0 |
| 4 | Overdue goal (also null) | excluded w/ reason `overdue`, **not** `no_deadline` |
| 5 | Completed goal (`0`) | excluded w/ reason `completed` |
| 6 | All goals same currency as budget | no conversion, `rateUsed` irrelevant, no `rateUnavailable` |
| 7 | JPY budget + VND goal, rate present | need divided by rate, ROUND_UP, matches `convertAmount` |
| 8 | VND budget + JPY goal, rate present | need multiplied by rate |
| 9 | Mixed currency, `rate = null` | `rateUnavailable: true`, totals null, `excluded` still populated |
| 10 | Deadline-less goal only + `rate = null` | **not** `rateUnavailable` — no conversion was needed |
| 11 | Need converts to a fraction | rounded **up**; `totalGoalNeed` ≥ un-rounded sum |
| 12 | Pool is fractional | rounded **down**; Σ allocation ≤ pool, always |
| 13 | Shortfall, three goals, distinct deadlines | allocation ordered nearest-deadline-first |
| 14 | Two goals, identical deadlines | tie broken by smaller need, then goalId — deterministic |
| 15 | Pool exhausted mid-list | one partial line (`coveredFully: false`), later lines `amount = 0` |
| 16 | `pool = 0` with unmet needs | every allocation line is `0`, none omitted |
| 17 | No shortfall (`available ≥ 0`) | `allocation === null` |
| 18 | Σ allocation amounts | always exactly `min(pool, totalGoalNeed)` |

## Todo List
- [x] `budget-math.service.ts` created, zero Prisma imports
- [x] `allocate` exported independently
- [x] All 18 cases in the matrix covered
- [x] `pnpm --filter @okane/api test` green
- [x] `lint` clean

## Success Criteria
Every case above passes. `grep -c "PrismaService\|@nestjs/common.*Http" budget-math.service.ts` is 0.
Case 18 (Σ allocation = `min(pool, totalGoalNeed)`) is the single invariant that catches a whole
family of rounding bugs — it must be asserted explicitly, not implied.

## Risk Assessment
| Risk | Likelihood | Impact | Countermove |
|---|---|---|---|
| Rounding drift makes the breakdown not add up to the headline number | High | Medium | Everything is integer in the budget currency after step 3; case 18 asserts the invariant directly |
| `Decimal` vs JS number mixing | Medium | High | No `Number()` anywhere in this module except where `ProgressBlock.progressPercent` already is one — and it is not used here |
| Someone later adds a Prisma query "just to fetch the goals" | Medium | High | Guard comment + the file taking `GoalNeedInput[]` as a parameter makes the shortcut awkward by design |
| Allocation shifts day to day as `monthsRemaining` ticks over | High | Low | By design — it is advisory and never persisted. Documented in the UI copy ([phase-05](phase-05-frontend-budget-and-split.md)) |

## Security Considerations
None directly — no I/O, no user identity, no secrets. It must never be handed raw DTO strings;
Phase 3 converts to `Decimal` before calling in, so an injected string can't reach arithmetic.

## Rollback
Delete both files. Nothing imports them until Phase 3 exists.

## Next Steps
Unblocks [phase-03](phase-03-backend-budget-endpoints.md).
