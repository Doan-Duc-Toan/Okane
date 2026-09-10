# Phase 2: Database Schema & Data Isolation

## Context Links
- Plan overview: [plan.md](plan.md)
- Depends on: [phase-01-project-setup.md](phase-01-project-setup.md)

## Overview
- Priority: Blocking (auth + features both need tables to exist)
- Status: pending
- Define `goals` and `savings_entries` tables/models, with an Eloquent global
  scope so every query is auto-filtered to the authenticated user's own rows.

## Key Insights
- No Postgres RLS available on MySQL — the safety net has to live in the
  application layer instead: a global Eloquent scope applied automatically to
  every query, so a developer has to opt OUT of isolation, not opt in.
- Laravel's default `users` table (from Breeze in Phase 3) is the identity source; app tables reference it via `user_id` FK.

## Requirements
- Functional: CRUD on goals and entries scoped to the authenticated user
- Non-functional: forgetting a `where('user_id', ...)` clause in a controller must NOT leak another user's data — the global scope must catch it

## Architecture
```
users (Laravel default table)
   └─< goals (user_id FK)
          └─< savings_entries (goal_id FK, user_id FK for defense-in-depth)
```

## Related Code Files
**Create:**
- `database/migrations/xxxx_create_goals_table.php`
- `database/migrations/xxxx_create_savings_entries_table.php`
- `app/Models/Goal.php`
- `app/Models/SavingsEntry.php`
- `app/Models/Scopes/BelongsToCurrentUserScope.php` — global scope

## Implementation Steps
1. `php artisan make:model Goal -m` → migration for `goals`:
   - `id`, `user_id` (foreign, cascade on delete), `name`, `target_amount` (decimal), `currency` (enum: JPY, VND), `deadline` (date, nullable), timestamps
2. `php artisan make:model SavingsEntry -m` → migration for `savings_entries`:
   - `id`, `goal_id` (foreign, cascade on delete), `user_id` (foreign, cascade on delete), `amount` (decimal), `note` (text, nullable), `entry_date` (date, default today), timestamps
3. Run `php artisan migrate`
4. Write `app/Models/Scopes/BelongsToCurrentUserScope.php`: a global scope that adds `where('user_id', auth()->id())` to every query when a user is authenticated
5. Apply the scope in `Goal::booted()` and `SavingsEntry::booted()` via `static::addGlobalScope(new BelongsToCurrentUserScope)`
6. Auto-set `user_id` on creation via a model `creating` event (`static::creating(fn ($model) => $model->user_id = auth()->id())`) so controllers never need to set it manually
7. Manually test: create rows as user A, log in as user B, confirm `Goal::all()` / `SavingsEntry::all()` return only user B's rows

## Todo List
- [ ] `goals` migration + model
- [ ] `savings_entries` migration + model
- [ ] Global scope auto-filtering by `user_id`
- [ ] Auto-set `user_id` on create
- [ ] Manual cross-user isolation test passes

## Success Criteria
- Migrations apply cleanly
- A logged-in user querying `Goal::all()` / `SavingsEntry::all()` only ever gets their own rows, verified with two test accounts

## Risk Assessment
- Risk: a raw query (`DB::table(...)`) bypasses the Eloquent global scope → Mitigation: MVP controllers must go through Eloquent models exclusively, not `DB::table()`, for these two tables
- Risk: `currency` enum too rigid if more currencies needed later → acceptable for MVP (YAGNI), extend via new migration when needed

## Security Considerations
- The global scope is the primary security boundary for this app (no DB-level RLS to fall back on) — this phase is the most security-critical phase in the whole plan
- `cascadeOnDelete()` on FKs prevents orphaned rows leaking data after account deletion

## Next Steps
→ Phase 3 (auth) builds on the `users` table + these models.
