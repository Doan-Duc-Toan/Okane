# Phase 5 — Frontend: budget settings, dashboard card, split flow, VI/JA

## Context Links
- [plan.md](plan.md) · contracts from [phase-03](phase-03-backend-budget-endpoints.md) and [phase-04](phase-04-backend-multi-goal-split.md)
- Patterns: `apps/web/src/features/goals/dashboard-page.tsx`, `components/goal-card.tsx`,
  `components/entry-form.tsx` (form + validate + `ApiError` handling), `components/currency-totals.tsx`
- `apps/web/src/components/ui/amount-input.tsx` — **reuse, do not build another money input**
- `apps/web/src/lib/api-client.ts` (`extractErrorDetails` → `apiError.<key>`), `lib/format.ts` (`formatMoney`)
- `apps/web/src/styles/tokens.css` — the only source of colour/spacing

## Overview
- **Priority:** P2 · **Status:** DONE · **Effort:** 3h · **Blocked by:** contracts in 3 and 4
- Three surfaces: a settings form at `/budget`, an available-balance card on the dashboard, and a
  split screen at `/split`.

## Key Insights
- **The dashboard card is the whole feature to a user.** Everything else is plumbing to make one
  number trustworthy. That number must always be accompanied by the breakdown that produces it —
  a headline figure nobody can reconcile is worse than no figure.
- **No new visual language.** `Card`, `LedgerList`, `ProgressBar`, `Money`, `EmptyState` and the
  design tokens already carry this app's look. The card is a `Card` with a hero number and a
  `LedgerList` of lines, in the same idiom as `CurrencyTotals`.
- **`Apply` navigates, it does not mutate.** The allocation card's primary action routes to `/split`
  with the suggested amounts pre-filled via router state. The user sees the amounts in an editable
  form and submits deliberately. Nothing is written on the dashboard — it is a read surface.
- **The split screen owns a "left to allocate" counter**, computed client-side. No server call for
  suggestions in the lump-sum case (the user types a total, adjusts per-goal amounts). The only
  server-computed suggestion in this feature is the monthly one from `/budget/available` (YAGNI).
- **`AmountInput` is a drop-in** — `value`/`onChange` carry the canonical number string, which is
  exactly what both new DTOs expect.
- **`rateUnavailable: true` is not an error.** Render the income/expense half plus an explanatory
  line ("goal totals need today's rate"), not `ErrorState`.

## Requirements
**Functional**
- `/budget`: read current settings, edit all five fields, save, show validation and API errors.
- Dashboard: available-balance card with hero number, counted breakdown, excluded list with reasons,
  and — when short — the suggested allocation with an *Apply* action.
- `/split`: pick goals, enter per-goal amounts (pre-fillable), one shared date and note, submit.
- Every new string in both `vi.json` and `ja.json`, including every new `apiError.*` key.

**Non-functional**
- Each new file under 200 lines; CSS Modules beside each component; tokens only, no hardcoded colours.
- TanStack Query cache invalidation after a split must refresh dashboard, budget-available, and the
  affected goals.

## Architecture
```
apps/web/src/features/budget/
├── budget.types.ts                       # mirrors the frozen contracts, money as string
├── budget.api.ts                         # getBudget / putBudget / getAvailable
├── hooks/use-budget.ts                   # ['budget'] query
├── hooks/use-available-balance.ts        # ['budget','available'] query
├── hooks/use-budget-mutations.ts         # PUT + invalidate ['budget'], ['budget','available']
├── budget-settings-page.tsx              # route /budget
└── components/
    ├── budget-form.tsx                   # 4 × AmountInput + currency Select
    ├── available-balance-card.tsx        # hero number + counted/excluded lines
    └── allocation-suggestion.tsx         # sorted lines + "Apply" → navigate('/split', {state})

apps/web/src/features/goals/
├── split-page.tsx                        # route /split
├── components/split-form.tsx             # per-goal rows + "left to allocate"
└── hooks/use-split-mutation.ts           # POST /entries/split + invalidations
```

**Data flow — dashboard:**
```
DashboardPage
 ├─ useDashboard()          → goals, totals, recentEntries   (unchanged)
 └─ useAvailableBalance()   → AvailableResponse              (parallel, independent)
      ├─ configured: false          → prompt card linking to /budget
      ├─ rateUnavailable: true      → income/expense half + explanatory line
      ├─ available >= 0             → hero number + counted breakdown + excluded list
      └─ shortfall > 0              → the above + <AllocationSuggestion />
```
A failure of `useAvailableBalance` must **not** blank the dashboard — render the card's own error
slot only. The two queries are independent by design.

**Data flow — apply → split:**
```
AllocationSuggestion "Apply"
  → navigate('/split', { state: { allocations: [{goalId, amount}], currency } })
  → SplitForm reads location.state (absent ⇒ empty form; /split is a valid direct entry point)
  → user edits, submits
  → POST /api/entries/split
  → invalidate ['dashboard'], ['budget','available'], ['goal', id] for each goalId
```

**Copy that must exist (both locales), because it carries the design decisions:**
- the allocation is a *suggestion*, recalculated every visit, and nothing is saved until you submit a split;
- why a goal is not counted: no deadline / overdue / already complete;
- what "available" means: income − fixed expenses − what your goals need this month.

New i18n keys: a `budget` namespace (`budget.*`, `split.*`) plus `apiError.budgetIncomeInvalid`,
`apiError.budgetExpenseInvalid`, `apiError.budgetCurrencyInvalid`, `apiError.splitAllocationsEmpty`,
`apiError.splitAllocationsTooMany`, `apiError.splitDuplicateGoal`, `apiError.splitAmountInvalid`.

## Related Code Files
**Create:** all files in the tree above, each with its `.module.css` where it renders markup.
**Modify:**
- `apps/web/src/app/routes.tsx` — add `/budget` and `/split` under the existing `AppShell` children
  (append, never restructure — same discipline the file's own comment states)
- `apps/web/src/components/layout/top-nav.tsx` (+ its module.css if a link needs styling) — Budget link
- `apps/web/src/features/goals/dashboard-page.tsx` — mount the card above `CurrencyTotals`
- `apps/web/src/i18n/locales/vi.json`, `ja.json`

**Read for context:** `features/goals/goals.types.ts`, `components/currency-totals.tsx`,
`components/entry-form.tsx`, `lib/api-client.ts`
**Delete:** none

## Implementation Steps
1. `budget.types.ts` — transcribe the Phase 3/4 contracts exactly; money is `string` everywhere, as
   `goals.types.ts` already establishes.
2. `budget.api.ts` + the three hooks, following `features/goals/goals.api.ts` and `hooks/use-dashboard.ts`.
3. `budget-form.tsx`: four `AmountInput`s (income, rent, food, other) + a currency `Select`. Validate
   non-empty and ≥ 0 client-side; surface server `ApiError.message` (already translated by
   `extractErrorDetails`) in the form's error slot.
4. `available-balance-card.tsx`: `Card` + hero `Money` + `LedgerList` of counted lines (goal name,
   need in budget currency, and — when the goal is in another currency — the original amount as a
   sub-line) + a muted excluded list with its reason. Handle `configured:false` and
   `rateUnavailable` as described.
5. `allocation-suggestion.tsx`: lines in server order (already nearest-deadline-first — do **not**
   re-sort client-side, the server's order is the decision), zero lines rendered muted rather than
   hidden, and the *Apply* button.
6. `split-form.tsx` + `split-page.tsx`: goal rows with `AmountInput`, a total field, a live
   "left to allocate" figure, one shared date (`max=today`) and note. Disable submit while the sum
   exceeds the total or no row is filled.
7. `use-split-mutation.ts` with the invalidations listed above.
8. Wire routes, nav link, dashboard mount.
9. Add every key to `vi.json` **and** `ja.json` in the same commit — a missing `ja` key renders the
   raw key to the user.
10. `pnpm --filter @okane/web build && lint && test`.

## Todo List
- [x] Types mirror the frozen contracts; money as string
- [x] API layer + 4 hooks
- [x] `budget-form.tsx` reuses `AmountInput` (no new money input)
- [x] Available card: configured / rateUnavailable / positive / shortfall — all four states
- [x] Excluded list renders a human reason per goal
- [x] Allocation lines kept in server order
- [x] *Apply* navigates with prefill; `/split` also works as a cold entry point
- [x] Split form's "left to allocate" and submit guard
- [x] Cache invalidations after split
- [x] Routes + nav link added by append
- [x] Every new key in **both** locales
- [x] Build, lint, test green

## Success Criteria
Dashboard shows one available number whose breakdown lines sum to it exactly, in both VI and JA, on
mobile and desktop widths. A goal with no deadline appears in the excluded list with a reason, never
silently. With the budget unset, the card is an invitation, not an error. *Apply* lands on a
pre-filled split form; submitting it updates the goal cards and the available number without a manual
reload. `grep -o '"[a-zA-Z.]*"' ` diff of `vi.json` vs `ja.json` key sets is empty.

## Risk Assessment
| Risk | Likelihood | Impact | Countermove |
|---|---|---|---|
| A missing `ja` key ships and renders a raw key | Medium | Medium | Both locale files edited in one commit; key-set diff is a success criterion |
| Card invents a new visual style | Medium | Medium | Composed from `Card`/`LedgerList`/`Money`; tokens only; no new colour values |
| Users read the suggestion as "already applied" | High | High | Copy states explicitly that nothing is saved until a split is submitted; the button says *Apply*, opens a form, and the form requires a deliberate submit |
| Router state lost on refresh at `/split` | Medium | Low | `/split` renders an empty, usable form when `location.state` is absent — prefill is a convenience, not a requirement |
| Available-balance query failure blanks the dashboard | Medium | High | Two independent queries; the card owns its own loading/error slot |
| A file drifts past 200 lines | Medium | Low | Card, allocation and form are already three components; split the form's row into a child if it grows |

## Security Considerations
- No new tokens or storage. Existing `api-client` attaches the bearer token.
- Financial figures live only in the TanStack Query cache (memory) — nothing written to
  `localStorage`.
- Client-side validation is UX only; the server re-validates everything (Phases 3 and 4).
- Never render a raw server string as prose — only `apiError.<key>` translations, per `api-client.ts`.

## Rollback
Remove the two routes and the nav link, unmount the card from `dashboard-page.tsx`, delete
`features/budget/` and the three split files. Locale additions are inert if left. The dashboard
returns to its current form exactly.

## Next Steps
Unblocks [phase-06](phase-06-tests-docs-rollout.md).
