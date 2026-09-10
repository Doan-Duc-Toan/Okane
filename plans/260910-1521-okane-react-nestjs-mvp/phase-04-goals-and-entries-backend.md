# Phase 4: Goals & Savings Entries Backend + Goal Math

## Context Links
- Plan overview: [plan.md](plan.md)
- Depends on: [phase-02](phase-02-prisma-schema-and-data-isolation.md) (schema + isolation rules),
  [phase-03](phase-03-auth-backend-jwt.md) (`@CurrentUser()`, global guard)
- **Soft dependency:** [phase-05](phase-05-exchange-rate-backend.md) — this phase calls
  `ExchangeRateService.getLatestRate()`. Only the *signature* is needed; the math is unit-tested
  with an injected rate, so Phase 4 can be built and tested before Phase 5 lands and wired at the end.

## Overview
- **Priority:** Blocking — this is the product's core.
- **Status:** done — cross-currency conversion demonstrated via unit tests against a fixed-rate
  fake, since the live rate isn't wired until Phase 5 (see Deviations below)
- **Effort:** 6h
- Goals CRUD, savings-entry logging with cross-currency freezing, the computed progress/goal-math
  payload, the dashboard summary endpoint, and the data-isolation test suite.

## Key Insights
- **Entries may be logged in either currency, and the conversion is frozen at logging time.**
  This is the product's actual differentiator: the user earns JPY and may be saving toward a VND
  target. Recomputing history at today's rate would make yesterday's progress drift — a correctness
  bug. `amountInGoalCurrency` + `fxRateUsed` are written once and never recalculated.
- **A goal's currency is immutable after creation.** Changing it would invalidate every frozen
  conversion already stored. The edit form locks the field; deleting and recreating is the
  documented path. Cheap rule, removes an entire class of corruption.
- **All math lives on the server.** One source of truth, unit-testable, and reusable by the future
  React Native client without reimplementation.
- **Suggested monthly = remaining ÷ months remaining. Nothing more.** No forecasting, no
  contribution-rate regression — explicitly out of scope per the brief.
- **Progress can exceed 100%.** Return the true percentage and let the UI cap the bar at 100 while
  showing the real number; silently clamping the data hides a user's over-achievement.

## Requirements
**Functional**
- Goal: create / list / read / update (name, target, deadline — **not** currency) / delete.
- Entry: create under a goal (amount, currency, date, optional note), list, update, delete.
- Every goal read returns a computed progress block.
- Dashboard endpoint returns per-currency totals + recent activity in one request.

**Non-functional**
- `targetAmount > 0`; entry `amount > 0` (deductions are out of scope for MVP — note as backlog).
- `entryDate` may not be in the future.
- Money in and out of the API as **strings** (Phase 2 decision).
- Every query scoped by `userId` per the Phase 2 table — no exceptions.

## Architecture
```
apps/api/src/goals/
├── goals.module.ts · goals.controller.ts · goals.service.ts
├── dashboard.controller.ts        # GET /api/dashboard (one round-trip for the dashboard screen)
├── goal-math.service.ts           # PURE: no Prisma, no HTTP — the unit-test target
├── goal-math.service.spec.ts
└── dto/{create-goal.dto.ts,update-goal.dto.ts}
apps/api/src/savings-entries/
├── savings-entries.module.ts · savings-entries.controller.ts · savings-entries.service.ts
└── dto/{create-entry.dto.ts,update-entry.dto.ts}
apps/api/test/data-isolation.e2e-spec.ts
```

**Endpoints (frozen — Phase 8 builds against these)**
| Method | Path | Notes |
|---|---|---|
| GET | `/api/dashboard` | totals by currency, goal cards w/ progress, 10 most recent entries |
| GET | `/api/goals` | list + progress per goal |
| POST | `/api/goals` | `{name, targetAmount, currency, deadline?}` |
| GET | `/api/goals/:id` | goal + progress block |
| PATCH | `/api/goals/:id` | `{name?, targetAmount?, deadline?}` — currency rejected (400) |
| DELETE | `/api/goals/:id` | cascades entries |
| GET | `/api/goals/:id/entries` | `?limit=50&cursor=` newest first |
| POST | `/api/goals/:id/entries` | `{amount, currency, entryDate, note?}` |
| PATCH | `/api/entries/:id` | re-freezes conversion **at today's rate**, documented in the UI copy |
| DELETE | `/api/entries/:id` | |

**Entry-creation data flow**
```
POST /goals/:id/entries {amount, currency, entryDate, note}
  ├─ goal = findFirst({id, userId})            → 404 if not owned   [isolation]
  ├─ currency === goal.currency ?
  │     yes → amountInGoalCurrency = amount ;            fxRateUsed = null
  │     no  → rate = ExchangeRateService.getLatestRate() → 503 if none available
  │           JPY→VND: amount × rate     VND→JPY: amount ÷ rate
  │           amountInGoalCurrency = rounded(2) ;        fxRateUsed = rate
  └─ create({ ..., userId, goalId })
```
Returning **503** (not a silent same-number fallback) when no rate exists is deliberate: writing an
unconverted amount into a different currency's total would corrupt the goal by a factor of ~168.

**Progress block (computed, returned with every goal)**
```jsonc
{ "savedAmount": "450000.00", "targetAmount": "1500000.00", "currency": "JPY",
  "progressPercent": 30.0,                 // true value, may exceed 100
  "remainingAmount": "1050000.00",
  "remainingInOtherCurrency": "176856200",  // null when no rate available
  "otherCurrency": "VND",
  "rateUsed": "168.43447600", "rateAsOf": "2026-09-10",
  "monthsRemaining": 10,                    // null when no deadline or deadline passed
  "suggestedMonthlyAmount": "105000.00",    // null in the same cases
  "deadlineStatus": "on_track" }            // on_track | overdue | no_deadline | completed
```

**`GoalMathService` — pure, signature-frozen**
```ts
computeProgress(input: {
  targetAmount: Decimal; savedAmount: Decimal; currency: Currency;
  deadline: Date | null; today: Date; rate: Decimal | null;   // rate = JPY→VND
}): ProgressBlock
```
`today` and `rate` are injected, never read from ambient state — that is what makes deadline and
FX behaviour deterministically testable.

**Math rules**
- `saved = Σ amountInGoalCurrency` (DB aggregate, not in-process).
- `remaining = max(0, target − saved)`.
- `monthsRemaining = max(1, ceil(days(today→deadline) / 30.44))`; `null` if no deadline or deadline < today.
- `suggestedMonthly = remaining ÷ monthsRemaining`, rounded up to whole currency units
  (rounding *down* would leave the user short of the target — round up).
- `progressPercent = saved ÷ target × 100`, 1 decimal place.
- Conversions use `Decimal`, never `number`.

## Related Code Files
**Create:** all files listed under the tree above.

**Modify:**
- `apps/api/src/app.module.ts` — import `GoalsModule`, `SavingsEntriesModule` (the one shared
  touchpoint with Phase 5; a two-line append, no restructure)

## Implementation Steps
1. DTOs with `class-validator`: `@IsString @Length(1,80)` name; `@IsDecimal`/`@IsPositive` target;
   `@IsEnum(Currency)`; `@IsDateString` deadline (optional, must be today or later);
   entry `entryDate` must not be in the future.
2. `GoalsService` — every method takes `userId` as its first argument, and every Prisma call uses the
   Phase 2 query shape (`findFirst`/`updateMany`/`deleteMany` + count check → 404).
3. `UpdateGoalDto` deliberately omits `currency`; with `forbidNonWhitelisted` a client sending it
   gets a 400 automatically. Add a one-line comment stating *why*, so nobody "fixes" it later.
4. `GoalMathService` as a pure class with the frozen signature. No Prisma import in this file — if
   one appears, the design has slipped.
5. Saved totals via `prisma.savingsEntry.aggregate({ _sum: { amountInGoalCurrency }, where: { goalId, userId } })`.
   For the list endpoint use one `groupBy` over all the user's goals — not N+1 aggregates.
6. `SavingsEntriesService.create` per the flow above; fetch the rate **once per request**, not per entry.
7. `PATCH /entries/:id`: re-run the conversion at today's rate when the amount or currency changes,
   and surface that in the UI copy (Phase 8) so it is not a hidden mutation.
8. `GET /api/dashboard`: `{ totals: [{currency, savedAmount, targetAmount, goalCount}],
   goals: [...with progress], recentEntries: [...10, each with goal name] }`.
9. Unit tests `goal-math.service.spec.ts` — the correctness-critical suite:
   zero saved · exactly 100% · over 100% · no deadline · deadline today · deadline passed ·
   target reached early · null rate ⇒ null cross-currency fields · JPY→VND and VND→JPY round-trip
   within tolerance · a value that would break float arithmetic.
10. e2e `data-isolation.e2e-spec.ts` — the security-critical suite. Two users, A and B; for every
    one of GET/PATCH/DELETE on `/goals/:id` and `/entries/:id`, plus `POST /goals/:bId/entries`,
    assert **404** when accessed by the wrong user, and assert `GET /goals` never contains B's rows.
11. Wire `ExchangeRateService` once Phase 5 exists; until then inject a stub provider so this phase
    stays independently runnable.

## Todo List
- [x] Goal DTOs + validation (currency immutable on update)
- [x] `GoalsService` fully `userId`-scoped, 404-on-foreign for every operation
- [x] `GoalMathService` pure, frozen signature, no Prisma import
- [x] Saved totals via aggregate/groupBy — no N+1 (verified: query count fixed at 5 goals/100
  entries and 10 goals/200 entries, both measured at 4 queries)
- [x] Entry creation freezes `amountInGoalCurrency` + `fxRateUsed`; 503 when no rate
- [x] `PATCH /entries/:id` re-freezes at today's rate (and the behaviour is documented)
- [x] `GET /api/dashboard` returns totals + goals + 10 recent entries in one call
- [x] `goal-math.service.spec.ts` covers all 10+ listed cases (12 tests)
- [x] `data-isolation.e2e-spec.ts` green — every cross-user access returns 404 (9 cases)
- [x] `app.module.ts` imports both modules

## Deviations from the blueprint
- **`GoalMathService`'s `ProgressBlock` omits `rateAsOf`; it's attached by the caller.** The frozen
  signature takes only `rate: Decimal | null`, with no date — `rateAsOf` is stitched on by
  `GoalsService` from a second port method (`RateProvider.getLatestRateAsOf()`), keeping the math
  service's signature exactly as specified and free of any notion of "when".
- **Soft dependency implemented as a `RateProviderModule` seam, not an ad hoc stub per module.**
  `RATE_PROVIDER` (DI token) + `RateProvider` interface live in `src/common/`; both `GoalsModule`
  and `SavingsEntriesModule` import `RateProviderModule`, which currently binds `StubRateProvider`
  (always returns `null`). Phase 5 wires the real `ExchangeRateService` by editing this one file
  rather than touching every consumer — same intent as the blueprint's stub guidance, just DRYer
  across two consumers instead of one.
- **Cross-currency entry-freezing and re-freezing are proven at the unit level
  (`savings-entries.service.spec.ts`, against a fixed-rate fake), not e2e.** With `StubRateProvider`
  always returning `null` (Phase 4 has no real rate yet), every cross-currency e2e attempt would
  503 by design — that's correct behavior, but it means the "logs ¥50,000 against a VND goal"
  success criterion can only be demonstrated live once Phase 5's real rate is wired in. The unit
  suite substitutes a `FixedRateProvider` to verify the freeze/re-freeze/immutability logic now;
  re-verify end-to-end after Phase 5 lands (tracked, not skipped).
- **Money DTOs validate as decimal-formatted strings (`@IsDecimal`), not `class-transformer`-typed
  `Decimal` fields.** An earlier draft tried `@Type(() => Decimal) @IsPositive()`, but
  `class-validator`'s `IsPositive` requires `typeof value === 'number'` and would reject every
  Decimal instance outright. Amounts stay as validated strings through the DTO layer and are only
  parsed into `Decimal` inside the service (matches the "money in/out as strings" rule from Phase 2
  more literally, too). `targetAmount > 0` / `amount > 0` and deadline/entryDate date-range rules
  are enforced in the service layer, not via decorators.
- **`GoalsController` and pagination-query parsing don't get a dedicated DTO file** — `limit`/`cursor`
  are validated inline via `ParseIntPipe`/`DefaultValuePipe` in `goal-entries.controller.ts` rather
  than a `list-entries-query.dto.ts`, since it's two primitives and a dedicated class-validator DTO
  would be pure ceremony (YAGNI).

## Success Criteria
- Every cross-user access in the isolation suite returns **404** (never 200, never 403).
- Logging ¥50,000 against a VND goal stores a converted `amountInGoalCurrency` and a non-null
  `fxRateUsed`; the goal's progress moves by the converted amount.
- After the rate changes, a previously logged entry's `amountInGoalCurrency` is **unchanged** —
  verified by re-reading the row, not by inspection.
- A goal with a 10-month deadline and ¥1,050,000 remaining reports `suggestedMonthlyAmount` of
  ¥105,000.
- `GET /api/dashboard` with 5 goals and 100 entries issues a bounded number of queries (log them once
  via Prisma's query event and confirm it does not scale with goal count).

## Risk Assessment
| Risk | Likelihood | Impact | Countermove |
|---|---|---|---|
| A `userId` scope omitted in one method → cross-user leak | Medium | **Critical** | The isolation e2e suite is written in this phase, not deferred; it is the phase's gate |
| Rounding drift accumulating across many converted entries | Medium | Medium | Round only at write time to 2dp and store; never re-round a stored value; test the round-trip tolerance |
| No rate available (fresh DB, provider down) blocks all cross-currency logging | Medium | Medium | 503 with an actionable message; same-currency logging still works; Phase 5's bootstrap fetch makes the empty-DB case rare |
| N+1 aggregates on the dashboard | Medium | Low | `groupBy` in step 5; query-count check in Success Criteria |
| User expects to edit a goal's currency | Medium | Low | Locked field with explanatory copy in Phase 8, not a silent 400 |
| Negative/corrective entries wanted (user logs a withdrawal) | Medium | Low | Out of MVP scope — backlog; edit/delete covers correction for now |

**Rollback:** revert this phase's commit; no migration to undo (schema is Phase 2's). Frontend
Phase 8 is the only consumer and is not yet integrated.

## Security Considerations
- Isolation is enforced per the Phase 2 query-shape table and **proven** by the e2e suite — this
  phase is where that promise is either kept or broken.
- 404 (not 403) for foreign resources, so IDs cannot be probed for existence.
- `forbidNonWhitelisted` prevents a client from injecting `userId` or `amountInGoalCurrency`
  directly — both are server-derived only.
- Goal `name` and entry `note` are user text rendered later by React (auto-escaped); no HTML
  sanitization needed as long as nothing uses `dangerouslySetInnerHTML` (Phase 8 rule).
- Cap `note` length (e.g. 500) and paginate entry lists so a single account cannot balloon responses.

## Next Steps
→ Phase 5 supplies the real `ExchangeRateService.getLatestRate()`.
→ Phase 8 (goals UI) consumes the frozen endpoints and the progress block.
