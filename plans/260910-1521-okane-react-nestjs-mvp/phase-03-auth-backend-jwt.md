# Phase 3: Auth Backend (JWT access + refresh)

## Context Links
- Plan overview: [plan.md](plan.md)
- Depends on: [phase-02-prisma-schema-and-data-isolation.md](phase-02-prisma-schema-and-data-isolation.md)
- Auth rationale: [stack research §4](../reports/researcher-260910-1513-okane-stack-decisions.md)

## Overview
- **Priority:** Blocking — every user-scoped endpoint needs `req.user.sub`.
- **Status:** pending
- **Effort:** 4h
- Email/password registration and login issuing a short-lived access token plus a rotating,
  server-revocable refresh token. Global auth guard with an opt-out `@Public()` decorator.

## Key Insights
- **Global guard, explicit opt-out.** Registering `JwtAuthGuard` as `APP_GUARD` and marking the
  handful of open routes `@Public()` fails *closed*: a new controller added in Phase 4 or 5 is
  protected the moment it exists. Per-controller guards fail open — one forgotten decorator is a
  wide-open financial endpoint.
- **Refresh tokens are hashed and stored, so sessions are revocable.** Pure stateless JWT has no
  logout; storing a hash gives real logout and a kill-switch, at the cost of one DB read per refresh
  (roughly once per 15 minutes per user — negligible).
- **Rotation with reuse detection.** Each refresh mints a new token and revokes the old one.
  Presenting an already-revoked token means it leaked → revoke that user's entire token family.
- **Google OAuth is deferred, and the old plan proves why:** Phase 3 of the cancelled Laravel plan
  stalled at "needs real Google OAuth credentials" — an external dependency no build step can
  satisfy autonomously. The mockup's Google button ships as a visibly disabled "coming soon"
  affordance (Phase 7), preserving the approved layout without a dead-end interaction.
- **Login must not reveal whether an email exists.** Same generic error and comparable timing for
  unknown-email and wrong-password.

## Requirements
**Functional**
- `POST /api/auth/register` → creates user, returns tokens + user profile.
- `POST /api/auth/login` → returns tokens + user profile.
- `POST /api/auth/refresh` → rotates and returns a new pair.
- `POST /api/auth/logout` → revokes the presented refresh token.
- `GET /api/auth/me` → current profile (authenticated).
- `PATCH /api/users/me` → update `displayName`, `locale`, `theme` (used by the persisted
  language/theme toggles once a user is signed in).

**Non-functional**
- Password rules: min 8 chars, at least one letter and one digit. No maximum below 72 bytes and
  no forced special character — arbitrary complexity rules push users toward weaker, reused passwords.
- bcrypt cost 12.
- Access TTL 15m, refresh TTL 30d, both from config.

## Architecture
```
apps/api/src/auth/
├── auth.module.ts
├── auth.controller.ts        # register · login · refresh · logout · me
├── auth.service.ts           # orchestration only
├── token.service.ts          # sign / verify / rotate / revoke  (unit-tested)
├── strategies/jwt.strategy.ts
├── guards/jwt-auth.guard.ts  # registered as APP_GUARD, honours @Public()
├── decorators/{public.decorator.ts,current-user.decorator.ts}
└── dto/{register.dto.ts,login.dto.ts,refresh.dto.ts}
apps/api/src/users/
├── users.module.ts · users.service.ts · users.controller.ts (PATCH /users/me)
└── dto/update-profile.dto.ts
```

**Token flow**
```
register/login ─▶ TokenService.issuePair(userId)
                   ├ access  = jwt.sign({sub,email}, ACCESS_SECRET, 15m)   → memory only, client-side
                   └ refresh = jwt.sign({sub,jti},   REFRESH_SECRET, 30d)
                                └ bcrypt(refresh) stored as RefreshToken.tokenHash

refresh ─▶ verify sig+exp ─▶ look up by jti ─▶ row missing?  → 401
                                              revoked?       → REUSE: revoke all user tokens, 401
                                              expired?       → 401
                          └▶ mark old revoked, issue new pair (same transaction)

logout  ─▶ mark that refresh row revoked (idempotent: already-revoked still returns 204)
```
Storing `jti` on the row makes lookup an indexed single-row read; bcrypt-comparing against every
row for a user would be O(n) hashes per refresh.

**Response contract (frozen — Phase 7 builds against this)**
```jsonc
// 201 register / 200 login / 200 refresh
{ "accessToken": "...", "refreshToken": "...", "expiresIn": 900,
  "user": { "id": "...", "email": "...", "displayName": null, "locale": "vi", "theme": "system" } }
// errors
{ "statusCode": 401, "message": "Invalid email or password" }   // login, both failure modes
{ "statusCode": 409, "message": "Email already registered" }    // register
```

## Related Code Files
**Create:** everything under `apps/api/src/auth/` and `apps/api/src/users/` as listed above;
`apps/api/test/auth.e2e-spec.ts`; `apps/api/src/auth/token.service.spec.ts`.

**Modify:**
- `apps/api/src/app.module.ts` — import `AuthModule`, `UsersModule`, register `APP_GUARD`
- `apps/api/.env.example` — JWT keys already declared in Phase 1; confirm in sync

## Implementation Steps
1. `pnpm --filter api add @nestjs/jwt @nestjs/passport passport passport-jwt bcrypt` and
   `-D @types/passport-jwt @types/bcrypt`.
2. `UsersService`: `findByEmail` (lowercased), `create`, `findById`, `updateProfile`.
   Never return `passwordHash` — select explicit fields, don't delete keys after the fact.
3. `TokenService`: `issuePair`, `rotate`, `revoke`, `revokeAllForUser`. Keep it free of HTTP
   concerns so it unit-tests without a Nest context.
4. `AuthService.register`: lowercase email → check existence → bcrypt hash (cost 12) → create →
   `issuePair`. Rely on the DB unique constraint for the race, mapping P2002 → 409 (the filter from Phase 2).
5. `AuthService.login`: fetch by email; if no user, still run a bcrypt compare against a dummy hash
   before returning the generic 401 — otherwise response timing enumerates registered emails.
6. `JwtStrategy`: extract bearer, validate against `JWT_ACCESS_SECRET`, return `{ userId: payload.sub, email }`.
7. `JwtAuthGuard extends AuthGuard('jwt')`, overriding `canActivate` to short-circuit on the
   `IS_PUBLIC_KEY` metadata. Register via `APP_GUARD` in `AppModule`. Mark register/login/refresh
   `@Public()` — and nothing else.
8. `@CurrentUser()` param decorator returning `request.user.userId`.
9. `UsersController.PATCH /users/me` with a whitelisted DTO (`displayName?`, `locale?`, `theme?`).
   `email` and `passwordHash` are not updatable in MVP.
10. Unit tests (`token.service.spec.ts`): pair issuance shape, rotation revokes the predecessor,
    **reuse of a revoked token revokes the whole family**, expired token rejected.
11. e2e (`auth.e2e-spec.ts`, supertest against `okane_test`): register → login → access a protected
    route → refresh → old refresh now rejected → logout → refresh rejected. Plus: duplicate register → 409;
    wrong password → 401 with the identical body as unknown email; no-token request → 401.
12. Verify manually with `curl` that `GET /api/auth/me` without a header returns 401 and with a
    fresh token returns the profile.

## Todo List
- [ ] Auth dependencies installed
- [ ] `UsersService` never selects or returns `passwordHash`
- [ ] `TokenService` issue/rotate/revoke/revokeAll implemented
- [ ] Register: lowercased email, bcrypt-12, P2002 → 409
- [ ] Login: generic 401 + dummy-hash compare for timing parity
- [ ] `JwtStrategy` + `JwtAuthGuard` registered as `APP_GUARD` with `@Public()` opt-out
- [ ] `@CurrentUser()` decorator available for Phases 4/5
- [ ] `PATCH /users/me` for displayName/locale/theme
- [ ] Unit tests incl. refresh-reuse family revocation
- [ ] e2e auth flow suite green against `okane_test`
- [ ] Response contract matches the frozen shape above (Phase 7 depends on it)

## Success Criteria
- Full flow passes in the e2e suite: register → protected read → refresh → old-token rejection →
  logout → refresh rejection.
- A brand-new controller added with no decorator is **inaccessible without a token** — verify by
  temporarily adding a throwaway route and hitting it unauthenticated (this proves fail-closed, the
  central claim of this phase).
- Unknown-email and wrong-password logins are indistinguishable in body, status, and rough timing.
- Reusing a rotated refresh token invalidates every session for that user.

## Risk Assessment
| Risk | Likelihood | Impact | Countermove |
|---|---|---|---|
| A later route forgets auth | Medium | **Critical** | Global `APP_GUARD` — the fail-closed default is the mitigation, plus the throwaway-route check in Success Criteria |
| Refresh token stolen via XSS on the web client | Low–Medium | High | Rotation + reuse detection limits the window; 15m access TTL; accepted MVP risk (see Phase 6 for the storage decision and its phase-2 upgrade path) |
| bcrypt cost 12 too slow under load | Low | Low | Solo MVP traffic; revisit only if login p95 becomes visible |
| Clock skew rejecting fresh tokens | Low | Medium | Leave default `clockTolerance`; both processes share one host in dev |
| Google OAuth expected by the user in MVP | Medium | Low | plan.md and Phase 7 both state it explicitly as disabled/backlog — surface it rather than silently drop it |

**Rollback:** revert the auth commit and remove the `APP_GUARD` registration; the Phase 2 schema
already contains `RefreshToken`, so no migration is undone. Nothing downstream is built yet.

## Security Considerations
- Access and refresh signed with **distinct** secrets; an access token can never be replayed as a refresh.
- Refresh tokens stored hashed — a database dump does not yield usable sessions.
- Password DTOs must never be logged. Ensure no request-body logger is enabled on `/api/auth/*`.
- `forbidNonWhitelisted` validation blocks mass-assignment (e.g. a client sending `"role":"admin"`).
- Rate limiting on login/register is **not** in MVP scope; note it as the first hardening item
  post-launch (`@nestjs/throttler`, ~10 attempts/min/IP) — recorded in Phase 10's checklist.

## Next Steps
→ Phase 4 (goals/entries) needs `@CurrentUser()` and the global guard.
→ Phase 5 (rate alerts) needs the same for per-user alert scoping.
→ Phase 7 (auth UI) builds against the frozen response contract above.
