# Phase 1: Project Setup & Infra

## Context Links
- Plan overview: [plan.md](plan.md)
- Brainstorm report: [../reports/brainstorm-260909-1453-savings-app-idea.md](../reports/brainstorm-260909-1453-savings-app-idea.md)

## Overview
- Priority: Blocking (everything depends on this)
- Status: pending
- Scaffold a Laravel app, connect it to a local/dev MySQL database, and get a
  "hello world" deploy live on Railway.

## Key Insights
- Get a deploy pipeline working before writing any feature — catches
  env/config issues early instead of at the end.
- Railway's free trial credit is enough to get the MVP live without upfront cost.

## Requirements
- Functional: app boots locally (`php artisan serve`) and on Railway; connects to MySQL successfully
- Non-functional: secrets never committed (`.env` gitignored)

## Architecture
```
Laravel app (PHP 8.3)
 ├─ .env                 (DB_*, APP_KEY, GOOGLE_CLIENT_ID/SECRET later in Phase 3)
 ├─ config/database.php  (mysql connection, default)
 └─ routes/web.php       (Blade-rendered routes)
```

## Related Code Files
**Create:**
- `composer.json`, base Laravel skeleton (via `laravel new`)
- `.env.example` — documents required env vars (no real secrets)
- `.gitignore` — confirm `.env` is excluded (Laravel default already covers this)

## Implementation Steps
1. `composer create-project laravel/laravel savings-goal-app` (or `laravel new`)
2. Init git repo (personal git account per user's earlier setup), first commit
3. Set up local MySQL (or use Railway's dev DB directly) — configure `.env` `DB_*` vars
4. Run `php artisan migrate` with the default Laravel migrations to confirm DB connectivity
5. Confirm `.env.example` documents all required vars with no real secrets, `.gitignore` covers `.env`
6. Push repo to GitHub (personal account), connect to Railway
7. Add a MySQL service on Railway, wire its connection env vars into the Laravel service
8. Confirm first Railway deploy is live and reachable

## Todo List
- [ ] Scaffold Laravel app
- [ ] Local MySQL connected, default migration runs
- [ ] `.env` / `.env.example` correctly separated
- [ ] Repo pushed to GitHub (personal account)
- [ ] Railway MySQL + Laravel services wired together
- [ ] First Railway deploy live

## Success Criteria
- `php artisan serve` runs locally with no errors, migrations apply
- Deployed Railway URL loads the default Laravel welcome page with DB connectivity confirmed

## Risk Assessment
- Risk: `.env` leaks into git → Mitigation: verify `.gitignore` before first commit (Laravel ships this by default, just confirm)
- Risk: personal vs company git account mixup → Mitigation: confirm `git config user.email` in this repo before first commit (per earlier session decision on personal git identity)

## Security Considerations
- Never commit `.env` (contains `APP_KEY`, DB credentials)
- `php artisan key:generate` must run once per environment (local + Railway)

## Next Steps
→ Phase 2 (database schema) builds on this Laravel + MySQL setup.
