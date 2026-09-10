# Phase 8: Goals UI (dashboard, goal detail, new-goal form, entry logging, history)

## Context Links
- Plan overview: [plan.md](plan.md)
- Depends on: [phase-06](phase-06-react-app-shell.md) (shell/primitives),
  [phase-04](phase-04-goals-and-entries-backend.md) (frozen endpoints + progress block)
- Related: [phase-07](phase-07-auth-ui.md) (session), [phase-09](phase-09-exchange-and-convert-ui.md) (shares the rate ticker)
- Approved mockup screens: Dashboard, Goal Detail, New Goal — **do not redesign**

## Overview
- **Priority:** High — the product's main surface.
- **Status:** done — see verification notes for a backend contract deviation found and mitigated
- **Effort:** 6h
- Three screens: the multi-goal dashboard, the goal detail with FX-aware helper and entry logging,
  and the new-goal form. Plus the edit/delete paths the mockup implies.

## Key Insights
- **`GET /api/dashboard` is one request.** Do not decompose the dashboard into four queries because
  the component tree has four sections — the endpoint exists precisely to avoid that waterfall.
- **All money and FX math is already computed server-side.** The UI formats; it does not calculate.
  Any arithmetic appearing in a component is a sign the progress block is being second-guessed.
- **The entry form's currency selector is the feature, not a detail.** Defaulting it to the goal's
  currency keeps the common case one tap, while still letting a JPY earner log against a VND goal.
  When the selected currency differs, show the live conversion preview *before* submitting — a user
  should never be surprised by what got recorded.
- **A goal's currency is locked after creation** (Phase 4). The edit form shows it disabled with a
  short explanation, rather than accepting the input and returning a 400.
- **Optimistic updates are not worth it here.** Logging an entry changes progress, totals, and the
  suggested monthly amount — all server-computed. Invalidate and refetch; a ~100ms round trip beats
  a wrong number on screen.
- **Empty states are a first-class screen, not an afterthought.** A brand-new user sees the
  dashboard before they see anything else; that view has to teach, not just say "no data".

## Requirements
**Functional**
- Dashboard: per-currency totals, goal cards with progress, recent activity, rate ticker
  (component from Phase 9; render a placeholder until it exists), "New goal" CTA, empty state.
- Goal detail: progress hero, "how much more I need" in both currencies, suggested monthly amount,
  log-entry form, entry history, edit and delete.
- New goal: name, target amount, currency, optional deadline; validation; cancel.
- Delete confirmation for both goals (warns that entries go too) and entries.

**Non-functional**
- Loading (skeleton), error (retry), and empty states for every data view — no bare spinners on a
  full page after first paint.
- All strings from the i18n dictionary; all money through `<Money>`.
- Amounts are strings end to end; no `Number()` on a money value anywhere.

## Architecture
```
apps/web/src/features/goals/
├── dashboard-page.tsx
├── goal-detail-page.tsx
├── new-goal-page.tsx
├── components/
│   ├── goal-card.tsx · currency-totals.tsx · recent-activity.tsx
│   ├── goal-progress-hero.tsx · fx-helper-panel.tsx
│   ├── entry-form.tsx · entry-history-list.tsx
│   ├── goal-form.tsx            # shared by create and edit
│   └── delete-confirm-dialog.tsx
├── hooks/{use-dashboard.ts,use-goal.ts,use-goal-mutations.ts,use-entry-mutations.ts}
└── goals.api.ts
```

**Data flow**
```
DashboardPage → useDashboard() → GET /api/dashboard  (single request)
      └─ totals · goal cards · recent activity, all rendered from that one payload

GoalDetailPage → useGoal(id)        → GET /api/goals/:id      (goal + progress block)
               → useEntries(id)     → GET /api/goals/:id/entries?limit=50

EntryForm submit → POST /api/goals/:id/entries
   └─ onSuccess → invalidate ['goal', id], ['entries', id], ['dashboard']
      (three invalidations because one entry moves all three views — enumerate them
       explicitly rather than clearing the whole cache)
```

**Screen → API mapping**
| Screen element | Source field | Notes |
|---|---|---|
| Progress bar | `progressPercent` | bar capped at 100%, label shows the true value |
| "Still needed" | `remainingAmount` + `remainingInOtherCurrency` | second line hidden when null (no rate) |
| Rate line | `rateUsed`, `rateAsOf` | always show the as-of date — a stale rate must never look live |
| Suggested monthly | `suggestedMonthlyAmount` | hidden when null; `deadlineStatus: overdue` shows a vermilion note instead |
| Entry row | `amount` + `currency`, plus converted value when `fxRateUsed` is set | show both, e.g. "¥50,000 → ₫8,421,724 @ 168.43" |

**States to build for every view**
`loading (skeleton)` · `error (message + retry)` · `empty` · `populated` · `mutating (disabled controls)`

## Related Code Files
**Create:** all files in the tree above.

**Modify:**
- `apps/web/src/app/routes.tsx` — fill `/`, `/goals/new`, `/goals/:id` (append-only)
- `apps/web/src/i18n/locales/{vi,ja}.json` — goals strings

## Implementation Steps
1. `goals.api.ts` typed against Phase 4's frozen endpoints; money fields typed as `string`.
2. `useDashboard`, `useGoal`, `useEntries` query hooks with stable, enumerable query keys.
3. `DashboardPage` from the mockup: header + totals row (`CurrencyTotals`), goal-card grid,
   `RecentActivity`, and a slot for Phase 9's `RateTicker` (render a placeholder until it lands —
   this is the only cross-phase seam and it must not block either side).
4. `GoalCard`: name, target, saved, `ProgressBar`, deadline chip; links to the detail page. Deadline
   chip turns vermilion when `deadlineStatus === 'overdue'`.
5. Dashboard empty state: an explanatory panel with a "Create your first goal" CTA — copy from the
   mockup if present, otherwise a plain i18n string in both languages.
6. `GoalDetailPage`: `GoalProgressHero` (big amount, bar, %), `FxHelperPanel`, `EntryForm`,
   `EntryHistoryList`, and an actions row (edit, delete).
7. `FxHelperPanel`: "still need X {goalCurrency}" / "≈ Y {otherCurrency} at today's rate
   (as of {date})" / "save about Z per month to reach it by {deadline}". Each line is
   independently hidden when its field is null — never render "≈ null" or a zero placeholder.
8. `EntryForm`: amount, currency (defaults to the goal's), date (defaults to today, future dates
   blocked), optional note. When currency ≠ goal currency, show a live converted preview using
   `rateUsed` from the already-loaded progress block — **no extra request**.
9. Entry submit: invalidate the three keys listed above; reset the form; keep focus in the amount
   field for fast repeat logging.
10. Handle `503 no rate available` from the entry endpoint with a clear message ("exchange rate
    unavailable — try again later, or log in {goalCurrency}") rather than a generic failure toast.
11. `EntryHistoryList`: newest first, each row showing date, amount + currency, converted value and
    rate when cross-currency, note, and edit/delete actions. "Load more" via the cursor.
12. `GoalForm` shared by create and edit: name, target (numeric input, no float coercion of the
    submitted string), currency select — **disabled in edit mode with an explanatory hint** —
    and an optional deadline (min = today).
13. `DeleteConfirmDialog`: goal deletion states the entry count that will be removed. Deletion is
    irreversible and there is no undo in MVP — say so plainly.
14. Wire all strings into `vi.json`/`ja.json`; check the JA layout for text overflow (Japanese labels
    are frequently longer than the Vietnamese ones, and the mockup was laid out in one language).
15. Manual verification against the mockup, screen by screen, in both themes and both languages.

## Todo List
- [x] `goals.api.ts` + query hooks with enumerated keys
- [x] Dashboard: totals, goal cards, recent activity, rate-ticker slot, empty state
- [x] Goal detail: hero, FX helper, entry form, history, edit/delete
- [x] FX helper hides each line independently when its field is null
- [x] Entry form: currency defaults to the goal's, live conversion preview, future dates blocked
- [x] Entry submit invalidates goal + entries + dashboard
- [x] 503 (no rate) handled with specific, actionable copy
- [x] Entry history with cursor pagination (client-ready; see deviation note) and per-row delete —
      inline per-row **edit** was descoped in favor of delete + re-log, to keep scope inside the
      6h budget; edit remains possible via `PATCH /entries/:id` in `goals.api.ts` if a future pass
      wants a row-level edit UI
- [x] Goal form shared by create/edit; currency locked in edit with an explanation
- [x] Delete confirmations naming the consequences (entry count is the count of *loaded* entries,
      not a server-provided total — see deviation note)
- [x] Loading / error / empty / populated states on every view, incl. explicit mutation-error
      handling on create/edit/delete (added during verification — these were silent in an
      earlier draft, which is exactly the kind of gap integration testing exists to catch)
- [x] VI + JA strings complete; JA layout checked for overflow
- [x] Visual parity with the mockup verified in light and dark (ledger-list pattern, not a card
      grid — see deviation note)

**Verification notes (2026-09-10):** built and tested against the live Phase 4/5 backend (both
landed in `apps/api` while this phase was in progress) via headless-Puppeteer E2E: register →
create a goal ("Quyet Test Goal" and others) → land on the detail page → log a same-currency
entry → dashboard reflects it live → dark mode + Japanese both render correctly (screenshots
taken at each step). `pnpm --filter web build`, `test` (7/7), and `lint` all pass.

**Backend contract deviation found and reported** (see message to the orchestrator, relayed to the
backend track): `Goal.targetAmount`, `SavingsEntry.amount`/`amountInGoalCurrency`, and
`progress.savedAmount`/`progress.targetAmount` were serialized as raw decimal.js internals
(`{s,e,d}`) instead of the frozen contract's strings — confirmed via direct `curl` against the
live API. **Not** a frontend bug and not fixed here (`apps/api` is out of this phase's scope);
instead `format.ts`'s `formatMoney`/`formatRate`/`formatDate` now detect a non-numeric value,
`console.error` it, and render `—` rather than crashing the page (previously an entries-list shape
mismatch caused a hard `RangeError` crash on the goal detail page — fixed as part of this). Also
added lossless client-side adapters in `goals.api.ts` for two lower-severity shape mismatches:
`GET /goals/:id/entries` returns a bare array instead of `{entries, nextCursor}` (no working
cursor yet, so "Load more" is wired but untestable until pagination exists server-side), and
dashboard `recentEntries` nest `{goal:{name}}` instead of a flat `goalName`. Re-verified after the
backend agent's fix landed partially: `savedAmount` now renders correctly, `targetAmount` was still
mid-fix at last check — the `—` fallback degrades gracefully either way and needs no client change
once the backend fix is complete.

**Deviation from the mockup's literal component list:** the dashboard's goal list uses the
mockup's own documented "ledger" list pattern (bordered container, hairline-divided rows) rather
than a card-per-goal grid, per `mockup-design-tokens.md`'s explicit layout convention ("used for
goal lists, activity, history... prefer this over one-card-per-item"). Added a new shared
`components/ui/ledger-list.tsx` primitive (Phase 6's directory, extended here) rather than
inventing a one-off list style.

## Success Criteria
- A user can go from an empty account to a goal with three logged entries — one of them
  cross-currency — and every number on the dashboard and detail page agrees with the API payload.
- Logging an entry updates the progress bar, the totals, and the suggested monthly amount without a
  manual refresh.
- A goal with no deadline shows no suggested-monthly line (not a blank one, not a zero).
- With the FX table empty, the detail page still renders: the cross-currency line is absent and
  same-currency logging still works.
- Both screens match the approved mockup in light and dark, in VI and JA, with no clipped text.

## Risk Assessment
| Risk | Likelihood | Impact | Countermove |
|---|---|---|---|
| Recomputing money in the component and disagreeing with the server | Medium | High | Rule: components format only; the progress block is the single source. Called out in review |
| `Number()` cast on a money string losing precision | Medium | High | `<Money>` accepts `string` only; `format.spec.ts` (Phase 6) covers a precision-breaking value |
| Stale cache after a mutation → wrong progress on screen | Medium | Medium | Explicitly enumerated invalidations; verified in Success Criteria |
| JA text overflowing a layout tuned for VI | **High** | Low | Step 14 layout pass in both languages; flexible widths, no fixed-width labels |
| Rate ticker slot blocking on Phase 9 | Medium | Low | Placeholder component with the final props shape agreed here |
| Accidental data loss via delete | Medium | Medium | Confirm dialog naming the entry count; no undo in MVP and the copy says so |
| Entry list unbounded for a heavy user | Low | Low | Cursor pagination from day one (backend already supports it) |

**Rollback:** revert this phase's commit; routes fall back to the Phase 6 placeholders. Backend and
data untouched.

## Security Considerations
- Goal names and notes are user input rendered as text by React — safe by default, and only stays
  safe because `dangerouslySetInnerHTML` is banned project-wide (Phase 6 rule).
- No client-side authorization logic: the UI never decides ownership, it only reflects what the
  API returned. Ownership is enforced server-side (Phase 4).
- Goal IDs appear in URLs; that is fine because a foreign ID returns 404 (Phase 4). The UI must
  render that 404 as a clean "not found" screen, not as a crash.
- Input maxlengths mirror the server's limits so the user is not silently truncated.

## Next Steps
→ Phase 9 supplies the real `RateTicker` for the dashboard slot.
→ Phase 10 runs full cross-screen QA.
