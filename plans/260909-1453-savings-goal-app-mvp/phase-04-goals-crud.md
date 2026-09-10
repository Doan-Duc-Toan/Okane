# Phase 4: Savings Goals CRUD

## Context Links
- Plan overview: [plan.md](plan.md)
- Depends on: [phase-03-authentication.md](phase-03-authentication.md)

## Overview
- Priority: High
- Status: pending
- Let a logged-in user create, list, edit, and delete their savings goals.

## Key Insights
- Keep the form dumb — name, target amount, currency (JPY/VND dropdown), optional deadline. No conversion logic (out of scope for MVP).
- The global scope from Phase 2 means `Goal::all()` / `Goal::find()` are already user-scoped — controllers stay simple.

## Requirements
- Functional: create/list/edit/delete goal; validate `target_amount` > 0
- Non-functional: authorize edit/delete via a Laravel Policy (defense-in-depth on top of the global scope)

## Architecture
```
routes/web.php                        → Route::resource('goals', GoalController::class)
app/Http/Controllers/GoalController.php
app/Http/Requests/StoreGoalRequest.php / UpdateGoalRequest.php
app/Policies/GoalPolicy.php
resources/views/goals/{index,create,edit}.blade.php
```

## Related Code Files
**Create:**
- `app/Http/Controllers/GoalController.php`
- `app/Http/Requests/StoreGoalRequest.php`
- `app/Http/Requests/UpdateGoalRequest.php`
- `app/Policies/GoalPolicy.php`
- `resources/views/goals/index.blade.php`
- `resources/views/goals/create.blade.php`
- `resources/views/goals/edit.blade.php`
- `resources/views/goals/_form.blade.php` — shared partial for create/edit

## Implementation Steps
1. `php artisan make:controller GoalController --resource`
2. `php artisan make:request StoreGoalRequest` / `UpdateGoalRequest` — validate `name` (required), `target_amount` (numeric, min:0.01), `currency` (in: JPY,VND), `deadline` (nullable date)
3. `php artisan make:policy GoalPolicy --model=Goal` — `update`/`delete` check `goal.user_id === auth()->id()` (belt-and-suspenders with the global scope)
4. Register resource route: `Route::resource('goals', GoalController::class)->middleware('auth')`
5. Implement controller actions using the Form Requests + Policy `authorize()` calls
6. Build `_form.blade.php` partial (name, target_amount, currency select, deadline date input), reused by `create` and `edit`
7. Build `index.blade.php` — list of goals with edit/delete links
8. Delete action: simple confirm via a small JS `confirm()` on the delete form submit — acceptable for MVP

## Todo List
- [ ] `GoalController` (resource actions)
- [ ] Form Requests (store/update validation)
- [ ] `GoalPolicy`
- [ ] Shared form partial
- [ ] Index/create/edit views
- [ ] Delete with confirm

## Success Criteria
- User can create a goal, see it in the list, edit its fields, and delete it — changes persist after reload

## Risk Assessment
- Risk: deleting a goal orphans its entries → Mitigated already by `cascadeOnDelete()` in Phase 2 schema

## Security Considerations
- Controllers must call `$this->authorize('update', $goal)` / `('delete', $goal)` before mutating — never trust route-model-binding alone

## Next Steps
→ Phase 5 (savings entries) attaches entries to goals created here.
→ Phase 6 (dashboard) reads this data to compute progress.
