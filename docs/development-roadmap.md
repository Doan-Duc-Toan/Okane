# Development Roadmap

## Post-MVP Features — done (2026-09-14)

**Budget allocation & savings splits** — monthly income/expenses with per-goal allocation
suggestions, and split-entry creation (allocate one deposit across multiple goals), full
end-to-end including the `/budget` settings page, the dashboard's available-balance card,
and the `/split` screen. See `plans/260914-1446-budget-allocation/`.

## MVP — done (2026-09-10)

All 10 phases of `plans/260910-1521-okane-react-nestjs-mvp/plan.md` complete: auth,
goals + cross-currency savings entries, exchange-rate backend with self-built history,
the full React UI (dashboard, goal detail, exchange/convert), and Phase 10 integration
hardening. See `docs/project-changelog.md` for the detailed entry.

Two items from Phase 10's own QA pass are flagged as **reported-but-not-independently
re-verified this session** rather than fully closed — see
`plans/260910-1521-okane-react-nestjs-mvp/phase-10-integration-qa-and-hardening.md`'s
Todo List for exactly which (the `[~]` items): a live run of the degraded-FX journey,
a full screen-by-screen JA visual sweep, and a real Lighthouse pass. None are believed
to be broken — the automated QA agent reported them as passing and the items that were
independently spot-checked (test counts, isolation, Decimal serialization, one of the
two contrast pairs) all came back exactly as reported — but they weren't re-proven
firsthand this pass, unlike the contrast defect that WAS caught and fixed. Worth a
deliberate look before any public launch.

## Backlog, roughly in the order it would be picked up

1. **Login rate limiting** (`@nestjs/throttler`, ~10 attempts/min/IP) — the first
   hardening item before any public exposure; explicitly deferred out of the MVP plan.
   Now that `/api/auth/google` exists, it needs the same throttling as `/api/auth/login` —
   an unauthenticated endpoint doing RSA verification per call is a plausible DoS surface.
2. **Deployment + CSP/security headers** (`helmet`) — host is now chosen (Vercel + Render +
   Supabase, see `docs/deployment.md`); when CSP lands, `script-src`/`connect-src`/`frame-src`
   must allowlist `https://accounts.google.com` or the Google button silently breaks.
3. ~~**Google OAuth**~~ — **done**, see `plans/260913-2152-google-oauth-login/`. ID-token
   flow via Google Identity Services; verified-email accounts auto-link to an existing
   password account. Follow-ups deliberately deferred: letting a Google-only account set
   a password, and unlinking a Google account.
4. **Rate-alert delivery** (email/push) — alerts currently only change state in-app
   (checked once a day by the same cron that snapshots the rate); there's no
   notification channel yet.
5. **Data export.**
6. **Recurring savings reminders.**
7. **PWA (iOS install)** — implemented: manifest, service worker, home-screen icons, and an
   update-available prompt (`plans/260912-1931-pwa-ios-install/`, phases 1–3; see
   `docs/project-changelog.md`). Phase 4 (real-iPhone verification) hasn't run yet, so treat as
   unproven until it does. Native mobile (React Native or otherwise) remains fully backlog; the
   API was deliberately built decoupled from the web app specifically so neither this nor a
   future native client needs backend changes.

## Explicitly declined, not just deferred

- **Paid FX historical-backfill API** — accepted that the rate-history chart starts
  thin and grows one day at a time from launch, rather than paying to seed a year of
  JPY/VND history no free source provides.
- **A query-guard abstraction for data isolation** (e.g. a Prisma `$extends` guard that
  throws on any unscoped query against a user-owned model) — the e2e isolation suite is
  considered sufficient for MVP scale; revisit only if a real leak is ever found (see
  `docs/data-model.md`).
