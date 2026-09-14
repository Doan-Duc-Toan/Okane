# Phase 3 — Backend: budget module, DTOs, endpoints

## Context Links
- [plan.md](plan.md) · [phase-01 (table)](phase-01-prisma-budget-settings.md) · [phase-02 (math)](phase-02-budget-math-module.md)
- Consumed by [phase-05 (frontend)](phase-05-frontend-budget-and-split.md) — **the wire contract below is frozen**
- Patterns: `apps/api/src/goals/goals.module.ts`, `goals.service.ts` (userId scoping),
  `apps/api/src/users/users.controller.ts` (PATCH-me shape), `apps/api/src/users/dto/update-profile.dto.ts` (i18n-key messages)

## Overview
- **Priority:** P2 · **Status:** pending · **Effort:** 1.5h · **Blocked by:** 1, 2
- A `BudgetModule` with three endpoints: read settings, write settings, read the computed block.

## Key Insights
- **`GET /budget/available` must not live on `DashboardService`.** The computation needs
  `GoalsService.findAllForUser`; if the dashboard also needed the budget block, `GoalsModule` would
  import `BudgetModule` which imports `GoalsModule` — a cycle. `BudgetModule` importing
  `GoalsModule` one-way is clean. `GoalsService` is already exported from `GoalsModule`, so no edit
  to that module is needed.
- **No rate → degrade, don't throw.** Unlike entry creation (where an unconverted amount corrupts a
  goal permanently and 503 is the right answer), this is a display number. Return 200 with
  `rateUnavailable: true`. A user whose goals are all in one currency is unaffected either way.
- **"Not configured" is a 200, not a 404.** A brand-new user hitting the dashboard must not see an
  error. `GET /budget` returns `{ configured: false, settings: null }`;
  `GET /budget/available` returns `{ configured: false }` and nothing else. The frontend renders a
  "set up your budget" prompt from that flag, not from a caught exception.
- `PUT` not `PATCH`: the settings form submits all five fields every time. A partial-update surface
  would be extra DTO branching for a form that never sends a partial (KISS).
- `Decimal` money crosses the wire as a fixed-scale **string** via the existing
  `DecimalSerializerInterceptor` — no new serialization code, but every new money field must be a
  real `Decimal` (not a JS number) or it will serialize wrong.

## Requirements
**Functional**
- Read, create and update a user's budget settings; upsert semantics (one row per user).
- Return the computed available block with per-goal breakdown, exclusions, and allocation.
- Validate: income ≥ 0, each expense ≥ 0, currency in the `Currency` enum.

**Non-functional**
- Every query scoped by `userId`; no `findUnique({ id })` on a settings row by its own id.
- Every validation/exception message is a stable camelCase i18n key. No English prose.
- No new env vars.

## Architecture

**Frozen wire contract** (money = fixed-scale strings, dates = ISO):

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/budget` | — | `{ configured: boolean, settings: BudgetSettings \| null }` |
| PUT | `/api/budget` | `UpdateBudgetDto` | `{ configured: true, settings: BudgetSettings }` |
| GET | `/api/budget/available` | — | `AvailableResponse` |

```ts
// BudgetSettings (response)
{ monthlyIncome: "400000.00", expenseRent: "120000.00", expenseFood: "30000.00",
  expenseOther: "0.00", currency: "JPY", updatedAt: "2026-09-14T..." }

// UpdateBudgetDto (request) — money as strings, same as CreateGoalDto.targetAmount
{ monthlyIncome: "400000", expenseRent: "120000", expenseFood: "30000",
  expenseOther: "0", currency: "JPY" }

// AvailableResponse — not configured
{ configured: false }

// AvailableResponse — configured
{ configured: true,
  budgetCurrency: "JPY",
  monthlyIncome: "400000.00",
  totalFixedExpenses: "150000.00",
  totalGoalNeed: "180000.00" | null,
  available: "70000.00" | null,          // may be negative
  shortfall: "0.00" | null,
  counted: [{ goalId, name, goalCurrency, needInGoalCurrency: "25000000.00",
              needInBudgetCurrency: "148000.00", deadline: "2027-03-01" }],
  excluded: [{ goalId, name, reason: "no_deadline" | "overdue" | "completed" }],
  rateUsed: "168.43447600" | null,
  rateAsOf: "2026-09-14" | null,
  rateUnavailable: false,
  allocation: [{ goalId, name, amount: "50000.00",
                 needInBudgetCurrency: "80000.00", coveredFully: false }] | null }
```

**Data flow for `GET /budget/available`:**
```
Controller(@CurrentUser)
  └─ BudgetService.getAvailable(userId)
       ├─ prisma.budgetSettings.findUnique({ where: { userId } })   → null ⇒ { configured: false }
       ├─ GoalsService.findAllForUser(userId)                       → GoalWithProgress[]
       ├─ rateProvider.getLatestRate() / getLatestRateAsOf()        → RATE_PROVIDER seam
       └─ BudgetMathService.computeAvailable({ ...settings, goals: map(...), rate })
            → AvailableBlock  (pure; the only place arithmetic happens)
```
`map(...)` projects each `GoalWithProgress` down to `GoalNeedInput` — `goalId`, `name`, `currency`,
`progress.suggestedMonthlyAmount`, `deadline`, `progress.deadlineStatus`. **Nothing else crosses into
the math module**, which is what keeps it pure and what the unit tests rely on.

New i18n error keys (must land in both `vi.json` and `ja.json` in [phase-05](phase-05-frontend-budget-and-split.md)):
`budgetIncomeInvalid`, `budgetExpenseInvalid`, `budgetCurrencyInvalid`.

## Related Code Files
**Create:**
- `apps/api/src/budget/budget.module.ts`
- `apps/api/src/budget/budget.controller.ts`
- `apps/api/src/budget/budget.service.ts`
- `apps/api/src/budget/dto/update-budget.dto.ts`

**Modify:** `apps/api/src/app.module.ts` (register `BudgetModule`)
**Read for context:** `apps/api/src/goals/goals.service.ts`, `apps/api/src/goals/goals.module.ts`,
`apps/api/src/common/rate-provider.interface.ts`, `apps/api/src/users/dto/update-profile.dto.ts`
**Delete:** none

## Implementation Steps
1. `dto/update-budget.dto.ts` — five required fields. Money validated as
   `@IsNumberString({ no_symbols: false }, { message: 'budgetIncomeInvalid' })` (mirror how
   `CreateGoalDto.targetAmount` is typed), currency `@IsEnum(Currency, { message: 'budgetCurrencyInvalid' })`.
   Every `message` is a key, never prose.
2. `budget.service.ts`:
   - `getSettings(userId)` → `findUnique({ where: { userId } })`.
   - `upsertSettings(userId, dto)` → `prisma.budgetSettings.upsert({ where: { userId }, create: { userId, ...}, update: {...} })`.
     Reject negatives with `BadRequestException('budgetIncomeInvalid' | 'budgetExpenseInvalid')`
     — `class-validator` proves the string is numeric, the service proves it is non-negative, exactly
     as `GoalsService.create` does for `targetAmount`.
   - `getAvailable(userId)` per the data flow above.
3. `budget.controller.ts` — `@Controller('budget')`, `@CurrentUser()` on every handler. No route
   takes an id: the user *is* the key.
4. `budget.module.ts` — `imports: [GoalsModule, RateProviderModule]`,
   `providers: [BudgetService, BudgetMathService]`, `controllers: [BudgetController]`. No exports.
5. Register `BudgetModule` in `app.module.ts` after `GoalsModule`.
6. `pnpm --filter @okane/api build && lint`. Manual smoke with `curl` + a real token.

## Todo List
- [ ] `UpdateBudgetDto` with i18n-key messages only
- [ ] `BudgetService` — all three methods, every query `userId`-scoped
- [ ] `upsert` keyed on `userId` (not on a row id)
- [ ] Controller with `@CurrentUser` on every handler, no id params
- [ ] `BudgetModule` imports `GoalsModule` (one-way — verify no cycle at boot)
- [ ] Registered in `app.module.ts`
- [ ] Not-configured path returns 200, not 404
- [ ] Build + lint clean

## Success Criteria
With a real token: `GET /api/budget` on a fresh user → `200 {configured:false}`; `PUT` → `200` with
fixed-scale money strings; `GET /api/budget/available` → a block whose `counted[].needInBudgetCurrency`
values sum to exactly `totalGoalNeed`, and `monthlyIncome − totalFixedExpenses − totalGoalNeed` equals
`available`. `grep -rn "message: '[A-Z ]" apps/api/src/budget/` returns nothing (no English prose).

## Risk Assessment
| Risk | Likelihood | Impact | Countermove |
|---|---|---|---|
| Nest module cycle at boot | Low | High | Dependency is one-way (`BudgetModule → GoalsModule`); `GoalsModule` is not edited at all. Boot the app as the check — Nest fails loudly on cycles. |
| Extra dashboard round-trip repeats the goals+sums query | Medium | Low | Accepted for a personal app. Escape hatch if it ever bites: move `getAvailable` into `DashboardService` and inject `BudgetMathService` + a thin `BudgetSettingsRepository` there, leaving `BudgetService` for the settings CRUD. Deliberately not done now (YAGNI). |
| Money arrives as a JS number and serializes wrong | Medium | High | DTO fields are strings; Prisma stores `Decimal`; the interceptor handles the rest. Assert fixed-scale strings in the e2e ([phase-06](phase-06-tests-docs-rollout.md)). |
| `rateUnavailable` treated as an error by the UI | Medium | Medium | It is a 200 with a boolean flag; [phase-05](phase-05-frontend-budget-and-split.md) renders an explanatory line, not an error state. |

## Security Considerations
- Every method takes `userId` from `@CurrentUser()`; no endpoint accepts a user or settings id, so
  there is no id to tamper with — cross-user access is structurally impossible here, not merely checked.
- `upsert` on a `userId @unique` key cannot create a row for another user.
- `forbidNonWhitelisted` is already global — an extra body field yields `unexpectedField`.
- Budget figures are personal financial data: never logged. No `console.log` of DTOs or settings rows.

## Rollback
Remove `BudgetModule` from `app.module.ts` and delete `apps/api/src/budget/` (except the Phase-2 math
files if they are to be kept). No existing route, service or table is modified, so nothing cascades.

## Next Steps
Unblocks [phase-05](phase-05-frontend-budget-and-split.md) and the budget half of
[phase-06](phase-06-tests-docs-rollout.md).
