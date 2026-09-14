# Phase 4 — Backend: multi-goal lump-sum split

## Context Links
- [plan.md](plan.md) · consumed by [phase-05 (frontend)](phase-05-frontend-budget-and-split.md) — **wire contract frozen below**
- `apps/api/src/savings-entries/savings-entries.service.ts` — `create()`, `freeze()`, `parseEntryDate()`
- `apps/api/src/savings-entries/entries.controller.ts` — already `@Controller('entries')`
- `docs/data-model.md` — why `amountInGoalCurrency`/`fxRateUsed` must never be recomputed later

## Overview
- **Priority:** P2 · **Status:** DONE · **Effort:** 1h · **Blocked by:** nothing — runs in parallel with 1–3
- One endpoint that turns "I have 500,000 JPY to put away" into one `SavingsEntry` per goal, each
  with its own correctly frozen `amountInGoalCurrency`.

## Key Insights
- **No new model, no new concept.** A split is N ordinary savings entries created together. Nothing
  records that they were one action — and nothing needs to. Adding a `Split` table would be a new
  ledger concept for zero user-visible capability (YAGNI).
- **A naive loop over `create()` is the wrong reuse.** It costs N goal lookups and N rate fetches,
  and it is not atomic: a failure on goal 3 of 4 leaves a half-written ledger with no UI to find or
  undo it. Reuse the *helpers* (`freeze`, `parseEntryDate`) instead of the *method*, then write once
  inside a transaction. `create()` itself is not modified at all.
- **One rate for the whole split.** Fetching the rate once means every cross-currency entry in one
  split shares one `fxRateUsed` — internally consistent, and it is what a user would expect from a
  single action. A per-goal fetch could straddle a rate refresh mid-split.
- **Each goal still freezes its own `amountInGoalCurrency`**, computed through the same
  `convertAmount` call the single-goal path uses. Cross-currency goals in one split are the normal
  case here (the allocation is denominated in the user's budget currency), not an edge case.
- **A foreign goalId must 404, not 403** — same rule the rest of the codebase follows: a 403 would
  confirm the row exists.

## Requirements
**Functional**
- Accept a date, an optional shared note, and 1–N `{ goalId, amount, currency }` allocations.
- Create one entry per allocation, atomically, returning all created entries.
- Reject: empty allocations, duplicate goalId, > 20 allocations, non-positive amount, future date,
  any goalId not owned by the caller.

**Non-functional**
- All-or-nothing. A partially applied split is the failure mode worth engineering against.
- i18n-key errors only. userId-scoped.

## Architecture

**Frozen wire contract:**

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/entries/split` | `CreateSplitDto` | `201 { entries: Entry[] }` |

```ts
// CreateSplitDto
{ entryDate: "2026-09-14",
  note?: "September allocation",
  allocations: [ { goalId: "...", amount: "50000", currency: "JPY" },
                 { goalId: "...", amount: "30000", currency: "JPY" } ] }
```
The response `Entry[]` is the same entry shape `POST /goals/:id/entries` already returns, in request
order — so the frontend reuses `Entry` from `goals.types.ts` with no new type.

**Data flow (all validation before any write):**
```
CreateSplitDto
  ├─ 1. shape validation (class-validator, @ValidateNested on allocations)
  ├─ 2. parseEntryDate(dto.entryDate)              → reused, throws entryDateFuture
  ├─ 3. duplicate-goalId scan                      → splitDuplicateGoal
  ├─ 4. goals = prisma.goal.findMany({ id: {in}, userId })   ← ONE query, userId-scoped
  │      goals.length !== ids.length               → NotFound('goalNotFound')
  ├─ 5. rate = rateProvider.getLatestRate()        ← ONE fetch, only if any cross-currency pair
  │      needed but null                           → ServiceUnavailable('rateUnavailable')
  ├─ 6. per allocation: freeze(amount, allocCurrency, goal.currency)  ← reused helper
  └─ 7. prisma.$transaction(datas.map(d => prisma.savingsEntry.create({ data: d })))
```
Steps 2–6 are pure-ish and cheap; step 7 is the only write and it is a single batch transaction, so
either every entry lands or none does.

New i18n error keys: `splitAllocationsEmpty`, `splitAllocationsTooMany`, `splitDuplicateGoal`,
`splitAmountInvalid`. Reused as-is: `goalNotFound`, `entryDateFuture`, `rateUnavailable`.

**`freeze()` visibility:** it is currently `private`. It stays private — `createSplit` lives on the
same `SavingsEntriesService`, so no visibility change and no new seam is introduced.

## Related Code Files
**Create:** `apps/api/src/savings-entries/dto/create-split.dto.ts`
**Modify:**
- `apps/api/src/savings-entries/savings-entries.service.ts` — add `createSplit(userId, dto)`; **do
  not touch `create()`**
- `apps/api/src/savings-entries/entries.controller.ts` — add `@Post('split')`

**Read for context:** `apps/api/src/savings-entries/dto/create-entry.dto.ts`,
`apps/api/src/common/currency-conversion.ts`
**Delete:** none

## Implementation Steps
1. `dto/create-split.dto.ts` — a `SplitAllocationDto` (`goalId` `@IsUUID`, `amount`
   `@IsNumberString(... { message: 'splitAmountInvalid' })`, `currency` `@IsEnum(Currency)`) and the
   outer DTO with `@IsArray() @ArrayMinSize(1, { message: 'splitAllocationsEmpty' })
   @ArrayMaxSize(20, { message: 'splitAllocationsTooMany' }) @ValidateNested({ each: true })
   @Type(() => SplitAllocationDto)`.
2. `savings-entries.service.ts` → `createSplit(userId, dto)` per the data flow. Positive-amount
   check mirrors `create()`'s (`splitAmountInvalid`).
3. `entries.controller.ts` → `@Post('split')` with `@CurrentUser()`. **Declare it above any
   `@Post(':id')`-style route** if one is ever added, so `split` is never captured as an id.
4. Extend `savings-entries.service.spec.ts` with unit cases: duplicate goalId, foreign goalId,
   mixed-currency freezing, rate-null rejection. House style is hand-rolled in-memory fakes — no
   `vi.mock` of Prisma.
5. `pnpm --filter @okane/api test && build && lint`.

## Todo List
- [x] `CreateSplitDto` with nested validation and i18n-key messages
- [x] `createSplit` validates everything *before* the first write
- [x] Single `findMany` for ownership, count-checked → `goalNotFound`
- [x] Single rate fetch, shared `fxRateUsed` across the split
- [x] `prisma.$transaction([...])` — atomic
- [x] `create()` left byte-identical
- [x] `@Post('split')` route ordering safe
- [x] Unit cases added

## Success Criteria
A split of 3 allocations across 2 JPY goals and 1 VND goal, from a JPY-denominated request, creates
exactly 3 entries; the VND goal's entry has `amountInGoalCurrency` = amount × rate and a non-null
`fxRateUsed`; the JPY goals' entries have `fxRateUsed: null`. A split containing one foreign goalId
creates **zero** entries and returns 404 — proven by asserting the entry count before and after in
[phase-06](phase-06-tests-docs-rollout.md). Each goal's `savedAmount` on the dashboard moves by
exactly its allocation.

## Risk Assessment
| Risk | Likelihood | Impact | Countermove |
|---|---|---|---|
| Partial write leaves an inconsistent ledger | Low | High | `$transaction` array form; ownership + freezing all happen before it opens |
| A cross-user goalId slips through | Low | High | Single `findMany({ id: { in }, userId })` + strict length equality; e2e proves 404 and zero rows written |
| Duplicate goalId double-credits a goal | Medium | Medium | Explicit pre-scan → `splitDuplicateGoal`. Not silently merged — the user should see their own mistake |
| Large split times out | Low | Low | Hard cap of 20 allocations |
| `create()` accidentally refactored, breaking the single-entry path | Medium | High | Phase forbids touching it; existing entry e2e specs are the regression net |

## Security Considerations
- `userId` comes from `@CurrentUser()` and is a `where` clause on the ownership query — a goalId
  belonging to another user is simply absent from the result and trips the count check.
- 404 on a foreign goalId, never 403 (existence disclosure), matching `data-isolation.e2e-spec.ts`.
- Amount cap and allocation cap bound the write volume of one request.
- `rateUnavailable` **throws** here (unlike the read path in Phase 3) — writing an unconverted amount
  into a different currency's total would corrupt the goal by a factor of ~168, permanently.

## Rollback
Delete the DTO, the `createSplit` method and the `@Post('split')` handler. `create()` and every
existing route are untouched, so the single-goal path cannot regress.

## Next Steps
Unblocks the split UI in [phase-05](phase-05-frontend-budget-and-split.md) and the split e2e in
[phase-06](phase-06-tests-docs-rollout.md).
