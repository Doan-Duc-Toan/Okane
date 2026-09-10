# Phase 3: Authentication

## Context Links
- Plan overview: [plan.md](plan.md)
- Depends on: [phase-02-database-schema.md](phase-02-database-schema.md)

## Overview
- Priority: Blocking (goals/entries features need a real signed-in user)
- Status: pending
- Install Laravel Breeze (Blade stack) for email/password auth, add Google
  login via Laravel Socialite.

## Key Insights
- Breeze scaffolds login/register/password-reset/logout out of the box —
  don't hand-roll any of this.
- Socialite handles the OAuth dance; only need to add a `google_id` column
  and a controller for the callback.

## Requirements
- Functional: sign up, log in, log out, session persists, protected routes redirect unauthenticated users to login
- Non-functional: password reset flow comes free with Breeze — no extra work needed

## Architecture
```
routes/web.php          → Breeze auth routes + auth()->middleware('auth') group for app routes
routes/auth.php          → Breeze-generated auth routes (login/register/logout)
app/Http/Controllers/Auth/GoogleController.php → Socialite redirect + callback
resources/views/auth/*   → Breeze Blade views
```

## Related Code Files
**Create:**
- `app/Http/Controllers/Auth/GoogleController.php`
- `database/migrations/xxxx_add_google_id_to_users_table.php`
**Modify:**
- `routes/web.php` — add Google auth routes + wrap app routes in `auth` middleware group
- `resources/views/auth/login.blade.php` — add "Sign in with Google" button (Breeze-generated, safe to edit)

## Implementation Steps
1. `composer require laravel/breeze --dev` → `php artisan breeze:install blade` → `npm install && npm run build`
2. Run Breeze's migrations (`php artisan migrate`) — creates/extends `users` table
3. `composer require laravel/socialite`
4. Add migration: `google_id` (string, nullable, unique) on `users` table
5. Configure Google OAuth credentials in `.env` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`) — client ID/secret from Google Cloud Console (user-provided)
6. Add `config/services.php` entry for `google`
7. Write `GoogleController@redirect` (→ `Socialite::driver('google')->redirect()`) and `@callback` (find-or-create user by `google_id`/email, log them in)
8. Wrap all app routes (goals, entries, dashboard) in `Route::middleware('auth')->group(...)`
9. Add "Sign in with Google" link to the Breeze login Blade view

## Todo List
- [ ] Breeze installed (Blade stack)
- [ ] Socialite installed + `google_id` column added
- [ ] Google OAuth credentials wired via `.env` + `config/services.php`
- [ ] `GoogleController` redirect + callback implemented
- [ ] App routes protected by `auth` middleware
- [ ] Login page shows both email/password and Google options

## Success Criteria
- User can sign up, log in with email or Google, stay logged in after refresh, log out, and cannot reach `/dashboard` while logged out

## Risk Assessment
- Risk: misconfigured OAuth redirect URI → Mitigation: verify redirect URI matches exactly in Google Cloud Console (including the Railway production URL, not just localhost)
- Blocker: Google OAuth setup requires the user's own Google Cloud Console project — cannot be done autonomously; user must provide `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`

## Security Considerations
- Never expose `GOOGLE_CLIENT_SECRET` client-side (server-only env var, standard Laravel `.env` handling)
- Breeze's session handling (CSRF tokens, hashed passwords) is battle-tested — do not bypass or hand-roll

## Next Steps
→ Phases 4 & 5 (goals/entries CRUD) require an authenticated user from this phase.
