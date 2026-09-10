# Phase 5: Savings Entries (Manual Logging)

## Context Links
- Plan overview: [plan.md](plan.md)
- Depends on: [phase-04-goals-crud.md](phase-04-goals-crud.md) (needs goals to attach entries to)

## Overview
- Priority: High
- Status: pending
- Let the user log a manual savings entry (date, amount, note) against a goal.

## Key Insights
- This is the core "did I save this month" action — keep the entry form as low-friction as possible (inline on the goal detail page, 3 fields, one submit).

## Requirements
- Functional: add entry to a goal; list entries per goal; delete an entry
- Non-functional: `amount` must be > 0; `entry_date` defaults to today

## Architecture
```
routes/web.php                              → nested resource: goals/{goal}/entries
app/Http/Controllers/SavingsEntryController.php
app/Http/Requests/StoreSavingsEntryRequest.php
resources/views/goals/show.blade.php         → goal detail: progress + entry list + add-entry form
```

## Related Code Files
**Create:**
- `app/Http/Controllers/SavingsEntryController.php`
- `app/Http/Requests/StoreSavingsEntryRequest.php`
- `resources/views/goals/show.blade.php`
- `resources/views/entries/_form.blade.php`
- `resources/views/entries/_list.blade.php`

## Implementation Steps
1. `php artisan make:controller SavingsEntryController`
2. `php artisan make:request StoreSavingsEntryRequest` — validate `amount` (numeric, min:0.01), `entry_date` (date, default today if absent), `note` (nullable string)
3. Register nested routes: `Route::resource('goals.entries', SavingsEntryController::class)->only(['store','destroy'])->middleware('auth')`
4. In `store()`: verify the `goal_id` route-model-bound goal belongs to `auth()->id()` (defense-in-depth on top of the Phase 2 global scope) before creating the entry
5. In `destroy()`: same ownership check before deleting
6. Build `entries/_form.blade.php` (amount, date input default-today, optional note)
7. Build `entries/_list.blade.php` (date, amount, note, delete button per row)
8. Build `goals/show.blade.php` combining: goal info, running total, entry form, entry list
9. Compute running total saved for that goal (`$goal->savingsEntries()->sum('amount')`) — pass to the view for Phase 6 reuse

## Todo List
- [ ] `SavingsEntryController` (store/destroy)
- [ ] Form Request validation
- [ ] Entry form partial
- [ ] Entry list partial
- [ ] Goal detail page wiring it together
- [ ] Running total calculation

## Success Criteria
- User can log an entry against a goal, see it appear in the list immediately, delete it, and the goal's total updates accordingly

## Risk Assessment
- Risk: user submits entry for a `goal_id` they don't own via crafted request → Mitigation: explicit ownership check in the controller (defense-in-depth) plus the Phase 2 global scope on the underlying query

## Security Considerations
- Re-verify `goal_id` ownership server-side before insert — do not rely solely on the global scope, since route-model-binding on `goals.entries` resolves the goal before the scope's `auth()->id()` filter is guaranteed applied in that exact code path

## Next Steps
→ Phase 6 (dashboard) aggregates this data across all goals.
