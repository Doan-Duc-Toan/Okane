# Development Roadmap

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
2. **Deployment + CSP/security headers** (`helmet`) — no host chosen yet; the CSP policy
   depends on the final origins and font sources, so it's bundled with this step rather
   than done speculatively now.
3. **Google OAuth** — the login screen already renders a disabled Google button; wiring
   it up needs a Google Cloud project and real credentials, which is the user's own
   account setup, not a code task.
4. **Rate-alert delivery** (email/push) — alerts currently only change state in-app
   (checked once a day by the same cron that snapshots the rate); there's no
   notification channel yet.
5. **Data export.**
6. **Recurring savings reminders.**
7. **PWA / native mobile** — the API was deliberately built decoupled from the web app
   specifically so this doesn't require backend changes when it happens.

## Explicitly declined, not just deferred

- **Paid FX historical-backfill API** — accepted that the rate-history chart starts
  thin and grows one day at a time from launch, rather than paying to seed a year of
  JPY/VND history no free source provides.
- **A query-guard abstraction for data isolation** (e.g. a Prisma `$extends` guard that
  throws on any unscoped query against a user-owned model) — the e2e isolation suite is
  considered sufficient for MVP scale; revisit only if a real leak is ever found (see
  `docs/data-model.md`).
