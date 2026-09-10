# Phase 7: Auth UI (login, register, session handling)

## Context Links
- Plan overview: [plan.md](plan.md)
- Depends on: [phase-06](phase-06-react-app-shell.md) (shell, primitives, `AuthContext`, api client)
- API contract: [phase-03](phase-03-auth-backend-jwt.md) — frozen response shape
- Approved mockup: Login screen (do not redesign)

## Overview
- **Priority:** Blocking for Phases 8/9 in practice — every other screen sits behind the session.
- **Status:** pending
- **Effort:** 3h
- The Login and Register screens, wired to the auth API, with the session lifecycle handled
  end to end (silent restore, expiry, logout).

## Key Insights
- **The Google button ships visibly disabled, labelled "coming soon".** The mockup's approved
  layout is preserved, and the user is told the truth. Deleting it would diverge from the approved
  design; wiring it would import an external dependency (Google Cloud Console credentials) that
  cannot be completed autonomously — exactly what stalled the cancelled Laravel plan's auth phase.
  If the user later supplies credentials, it becomes a small standalone phase.
- **The mockup has no Register screen.** One is required — `/register` reuses the Login screen's
  card layout and tokens rather than introducing a new visual pattern. This is the one place this
  phase adds UI beyond the mockup, and it is intentionally derivative.
- **Login errors must stay generic.** The server returns one message for both unknown email and
  wrong password (Phase 3); the UI must not "helpfully" split them, or it re-opens the enumeration
  hole the backend closed.
- **Double-submit is the classic auth-form bug.** The submit button disables on pending, and the
  mutation is not re-fired while in flight.

## Requirements
**Functional**
- `/login`: email, password, submit, link to register, disabled Google button.
- `/register`: email, password, confirm password, optional display name, link to login.
- Success → store tokens → redirect to the originally requested route, defaulting to `/`.
- Signed-in user visiting `/login` or `/register` → redirect to `/`.
- Sign-out from the nav clears the session and calls the logout endpoint.
- Expired/invalid session anywhere → redirect to `/login` with a "session expired" notice.

**Non-functional**
- Client-side validation mirrors the server's rules (min 8 chars, letter + digit) so the user is
  not round-tripped for a preventable error — the server remains the authority.
- All labels, placeholders, and errors come from the i18n dictionary (VI + JA).
- Form is fully keyboard-operable; inputs carry correct `autoComplete` values.

## Architecture
```
apps/web/src/features/auth/
├── login-page.tsx          · register-page.tsx
├── components/auth-card.tsx      # shared card chrome for both screens
├── components/google-button.tsx  # disabled, aria-disabled, "coming soon" title
├── hooks/use-login.ts · use-register.ts     # TanStack useMutation wrappers
└── auth.api.ts                   # typed calls to /api/auth/*
```

**Flow**
```
submit ─▶ client validation ─▶ useMutation ─▶ POST /api/auth/login
   ├ 200 → AuthContext.setSession({access(memory), refresh(localStorage), user})
   │        → apply user.locale / user.theme if set → navigate(from ?? '/')
   ├ 401 → generic inline error (i18n key auth.error.invalidCredentials)
   ├ 409 (register) → "email already registered"
   └ network/5xx → ErrorState with a retry affordance

boot ─▶ refresh token present? → silent refresh → session restored, else guest
401 anywhere ─▶ api-client refresh fails ─▶ clear session ─▶ /login?reason=expired
```

## Related Code Files
**Create:** all files in the tree above.

**Modify:**
- `apps/web/src/app/routes.tsx` — swap the `/login` and `/register` placeholders (append-only)
- `apps/web/src/i18n/locales/{vi,ja}.json` — auth strings
- `apps/web/src/components/layout/top-nav.tsx` — wire the sign-out action

## Implementation Steps
1. `auth.api.ts`: `register`, `login`, `logout`, `me` — typed against Phase 3's frozen contract.
2. `AuthCard`: the shared shell (brand mark, title, slot, footer link) so the two screens cannot
   drift apart visually.
3. `LoginPage`: controlled email/password inputs (`autoComplete="email"` / `"current-password"`),
   submit disabled while pending, inline generic error, "Create account" link, `GoogleButton`.
4. `GoogleButton`: rendered per the mockup but `disabled` + `aria-disabled="true"` with an i18n
   "coming soon" title. Do **not** attach an onClick.
5. `RegisterPage`: email, password, confirm-password (matched client-side), optional display name;
   maps 409 to a field-level email error.
6. On success, call `AuthContext.setSession(...)`; if the returned `user.locale`/`user.theme` differ
   from the local preference, adopt the server's — it represents the user's cross-device choice.
7. Redirect back to the pre-login destination: `ProtectedRoute` stores `location` in navigation
   state; the login page reads it and falls back to `/`.
8. Add a `PublicOnlyRoute` (or an inline check) so an authenticated user cannot land on `/login`.
9. Sign-out in the nav: `POST /api/auth/logout` (fire-and-forget, but awaited long enough to log a
   failure), clear the in-memory token, remove the stored refresh token, `queryClient.clear()`
   — **clearing the query cache matters**, or the next user on the same browser briefly sees the
   previous user's cached goals.
10. `/login?reason=expired` renders a neutral notice above the form.
11. Add every auth string to `vi.json` and `ja.json`.
12. Manual verification: register → land on the dashboard → reload → still signed in →
    sign out → `/` redirects to `/login` → sign in again → back to the dashboard.

## Todo List
- [ ] `auth.api.ts` typed against the frozen contract
- [ ] Shared `AuthCard`; Login and Register both built on it
- [ ] Login: generic error, pending-disabled submit, correct `autoComplete`
- [ ] Google button rendered disabled with a "coming soon" label — no handler
- [ ] Register: confirm-password match, 409 → email field error
- [ ] Session stored via `AuthContext`; server `locale`/`theme` adopted on login
- [ ] Redirect back to the originally requested route
- [ ] Authenticated users bounced off `/login` and `/register`
- [ ] Sign-out: server revoke + local clear + `queryClient.clear()`
- [ ] `?reason=expired` notice
- [ ] VI/JA strings complete for both screens
- [ ] Manual flow verified end to end incl. reload persistence

## Success Criteria
- Register → dashboard → hard reload → still signed in (silent refresh working).
- Wrong password and unknown email produce an **identical** on-screen message.
- Sign out, then sign in as a second user: no trace of the first user's data appears, even for a
  frame (proves the cache clear).
- Both screens are fully usable by keyboard alone, and read correctly in VI and JA.
- Leaving the tab idle past the 15-minute access TTL and then clicking around refreshes silently
  with no visible interruption.

## Risk Assessment
| Risk | Likelihood | Impact | Countermove |
|---|---|---|---|
| Previous user's cached data visible after account switch | Medium | High | `queryClient.clear()` on logout **and** on login; explicitly checked in Success Criteria |
| Redirect loop between `ProtectedRoute` and `PublicOnlyRoute` | Medium | Medium | Single source of truth for "is authenticated" in `AuthContext`; a `restoring` state that renders a spinner instead of redirecting |
| User expects working Google sign-in | Medium | Low | Visibly disabled + labelled, not a dead button; recorded in plan.md's backlog |
| Client validation drifting from server rules | Medium | Low | Keep the rule text in one i18n key referenced by both the hint and the error |
| Silent-refresh failure at boot leaving a blank screen | Low | Medium | Restoring state renders the spinner; any failure falls through to guest, never to a hang |

**Rollback:** revert this phase's commit; routes fall back to the Phase 6 placeholders. No data effect.

## Security Considerations
- Password fields are `type="password"` with correct `autoComplete`; never logged, never in query strings.
- No credentials in URLs and no tokens in navigation state.
- Generic auth errors preserve the backend's anti-enumeration property.
- Logout revokes server-side, so a copied refresh token dies with the session.
- Browser password-manager support is left on — managers produce stronger passwords than users do.

## Next Steps
→ Phases 8 and 9 now render behind a real session.
