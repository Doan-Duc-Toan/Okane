---
title: "Sign in with Google — second login method alongside email/password"
description: "Wire the already-rendered (disabled) Google button to a real GIS ID-token flow: verify server-side, find-or-create/link the user, issue the existing JWT pair."
status: pending
work_type: feature
priority: P2
effort: 6.5h
branch: main
tags: [auth, oauth, google, prisma, nestjs, react]
created: 2026-09-13
blockedBy: []
blocks: []
---

# Plan: Sign in with Google

## Overview
Add Google as a **second** way into an existing account system — not a replacement. Email/password
stays exactly as it is. The login screen already renders a disabled Google button
(`apps/web/src/features/auth/components/google-button.tsx`, honest "coming soon"); this plan makes
it real. Closes roadmap backlog item 3.

The whole feature is one new public endpoint plus one column and one nullability change. Everything
downstream of "we know who this user is" — token issue/rotate, session storage, silent restore,
locale/theme adoption — is reused untouched.

**Not in scope:** Apple/Facebook/other providers, Google One Tap auto-prompt, account *unlinking*,
"set a password on my Google account" UI, requesting any Google API scope beyond `openid email
profile`, password reset (still absent, still backlog).

## The decision that shapes everything: ID-token flow, not server-side redirect

Chosen: **Google Identity Services button → ID token (JWT) → `POST /api/auth/google` → server-side
`verifyIdToken` → existing `TokenService.issuePair`.**

Rejected: full Authorization Code flow via `passport-google-oauth20`.

Why, in one line each — full reasoning in [phase-03](phase-03-backend-google-id-token-endpoint.md):
- **Web and API are different registrable domains** (`okane-web.vercel.app` / `okane-api-7v0o.onrender.com`).
  A server-owned callback lands on the API domain and then has to get tokens *back* to the web
  domain: cookies can't cross, so it needs a fragment redirect (tokens in browser history) or a
  one-time-code table plus an exchange endpoint. Two extra endpoints and new state for zero extra
  capability.
- **The session contract already exists and is bearer-token JSON.** The ID-token endpoint returns
  the *same* `AuthSession` shape as `/auth/login`, so `auth-context.tsx`, `api-client.ts` and the
  CORS config need no change at all.
- **We want identity, not access.** No Google API calls on the user's behalf → no Google refresh
  token → **no `GOOGLE_CLIENT_SECRET` anywhere**. One less production secret.

## Phases

| # | Phase | Status | Effort | File |
|---|-------|--------|--------|------|
| 1 | Google Cloud Console setup — **manual, user-only** | pending | 0.5h | [phase-01-google-cloud-console-setup.md](phase-01-google-cloud-console-setup.md) |
| 2 | Prisma: `passwordHash` nullable + `googleId` | pending | 0.5h | [phase-02-prisma-schema-google-identity.md](phase-02-prisma-schema-google-identity.md) |
| 3 | Backend: verifier, DTO, `POST /api/auth/google`, linking rules | pending | 1.5h | [phase-03-backend-google-id-token-endpoint.md](phase-03-backend-google-id-token-endpoint.md) |
| 4 | Frontend: GIS script, live button, shared session handoff, VI/JA | pending | 1.5h | [phase-04-frontend-google-sign-in-button.md](phase-04-frontend-google-sign-in-button.md) |
| 5 | Tests: unit (service + linking) and e2e (real HTTP, faked verifier) | pending | 1.5h | [phase-05-tests-unit-and-e2e.md](phase-05-tests-unit-and-e2e.md) |
| 6 | Deployment env vars, docs, production verification | pending | 1h | [phase-06-deployment-env-and-docs.md](phase-06-deployment-env-and-docs.md) |

## Key dependencies

```
1 (Console → Client ID) ─────────────────────────────┬──────────────→ 6 (deploy + verify)
                                                     │                      ▲
2 (schema) ──→ 3 (backend) ──┬──→ 5 (tests) ─────────┴──────────────────────┘
                             │       ▲
        4 (frontend) ────────┴───────┘
```
- **Phase 1 blocks nothing in code.** 2–5 are written and unit-tested against a faked verifier with
  no real Client ID. Phase 1 only gates *real* browser sign-in and Phase 6.
- Phase 3 needs Phase 2's `googleId` column to exist.
- **Phases 3 and 4 are parallel-runnable** — disjoint file ownership (`apps/api/**` vs
  `apps/web/**`) against the frozen wire contract in Phase 3's Architecture section.
- Phase 5 needs both 3 and 4 on disk.
- Phase 6 needs 1 (the Client ID) and 5 (green).

## Decisions already made (don't re-litigate)
- **`passwordHash` becomes nullable**, no sentinel hash, no separate `AuthIdentity` table. The
  existing `record?.passwordHash ?? DUMMY_HASH` line in `auth.service.ts` already handles a
  password-less user with correct constant-ish timing; a table split is a bigger migration for one
  provider (YAGNI). See [phase-02](phase-02-prisma-schema-google-identity.md).
- **Auto-link by verified email.** An existing password account whose email matches, with Google
  reporting `email_verified: true`, gets `googleId` attached and is signed in. Only with
  `email_verified: true` — that flag is the entire security argument.
- **One endpoint for sign-in and sign-up**, returning `200`. Google can't tell us in advance
  whether the account exists, and splitting it would need a lookup round-trip for no gain.
- **`GOOGLE_CLIENT_ID` is optional config.** Unset → the API returns `503 googleNotConfigured`
  and the web app keeps rendering today's disabled button. Local dev without credentials still
  boots and still passes tests.
- **Verification is wrapped in an injectable `GoogleTokenVerifier`** so unit *and* e2e tests can
  substitute a fake instead of minting real Google tokens or hitting Google's cert endpoint.
- **The disabled button is rewired in place**, not replaced by a new component — the approved
  `AuthCard` layout stays byte-identical.

## Testing posture
`GoogleTokenVerifier` is the seam. Unit tests (`auth.service.spec.ts`, house style =
`token.service.spec.ts`: hand-rolled in-memory fakes, no `vi.mock` of Prisma) cover find-or-create,
verified-email linking, unverified-email rejection, and invalid-token rejection. E2E
(`auth-google.e2e-spec.ts`) overrides the verifier provider so the full HTTP + real Postgres path is
deterministic and network-free — same posture `auth.e2e-spec.ts` already has for email/password.

The one thing tests cannot prove is that Google's own button renders and returns a credential: that
is Phase 6's manual production check.

## Success criteria
On `https://okane-web.vercel.app`: click "Sign in with Google" → Google's account chooser → land on
the dashboard authenticated, in the same session state an email/password login produces (reload
keeps you in, refresh rotation works, logout works). A brand-new Google email creates an account; a
Google email matching an existing password account signs into **that same account** with its goals
intact; that account can still log in with its password afterwards. Zero English prose in any new
error response.

## Next steps after delivery
Tick roadmap backlog item 3, add a `docs/project-changelog.md` entry, update
`docs/system-architecture.md`'s auth paragraph and `docs/data-model.md`'s `User` line. Natural
follow-ups, explicitly *not* now: "set a password" for Google-only accounts, and login rate
limiting (backlog item 1) which should cover the new endpoint too.
