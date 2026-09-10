# Phase 6: Dashboard & History UI

## Context Links
- Plan overview: [plan.md](plan.md)
- Depends on: [phase-04-goals-crud.md](phase-04-goals-crud.md), [phase-05-savings-entries.md](phase-05-savings-entries.md)

## Overview
- Priority: High
- Status: pending
- Build the landing page after login: overview of all goals with progress bars,
  total saved across everything, and a combined transaction history.

## Key Insights
- No design source (not a MoMorph/Figma project) — keep UI simple and clean,
  no need for pixel-perfect fidelity. Tailwind (already scaffolded by Breeze in Phase 3) is enough.

## Requirements
- Functional: show all goals with % progress; show grand total saved; show recent entries across all goals
- Non-functional: use eager loading / a single aggregate query per section (avoid N+1 queries)

## Architecture
```
app/Http/Controllers/DashboardController.php
resources/views/dashboard.blade.php
resources/views/goals/_progress-card.blade.php
resources/views/entries/_recent-list.blade.php
```

## Related Code Files
**Create:**
- `app/Http/Controllers/DashboardController.php`
- `resources/views/dashboard.blade.php`
- `resources/views/goals/_progress-card.blade.php`
- `resources/views/entries/_recent-list.blade.php`
**Modify:**
- `routes/web.php` — make `/dashboard` the default authenticated landing route

## Implementation Steps
1. In `DashboardController@index`: fetch goals with `Goal::withSum('savingsEntries', 'amount')->get()` (single query, no N+1) to get each goal's total saved alongside its target
2. Fetch recent entries across all goals: `SavingsEntry::with('goal')->latest('entry_date')->limit(10)->get()`
3. Build `_progress-card.blade.php`: name, progress bar (`saved/target`), currency, deadline if set
4. Build `_recent-list.blade.php`: last N entries, newest first, showing which goal each belongs to
5. Build `dashboard.blade.php` combining: grand total saved (sum across all goals' `savingsEntries`), goal cards grid, recent entries list
6. Update `routes/web.php` so `/dashboard` is the default redirect target after login (Breeze's `RouteServiceProvider::HOME` constant)

## Todo List
- [ ] `DashboardController` with aggregate queries (no N+1)
- [ ] Goal progress card partial
- [ ] Recent entries list partial
- [ ] Dashboard view assembled
- [ ] Post-login redirect points here

## Success Criteria
- After login, user lands on a dashboard showing every goal's progress %, a grand total, and recent activity — matches data entered in Phases 4/5

## Risk Assessment
- Risk: naive per-goal queries cause N+1 as goal count grows → Mitigation: use `withSum` (one query with a join/group-by) from the start, acceptable even at MVP scale

## Security Considerations
- All aggregate queries still go through Eloquent, so the Phase 2 global scope applies the same as everywhere else

## Next Steps
→ Phase 7 (QA & deploy) is the final validation + ship step.
