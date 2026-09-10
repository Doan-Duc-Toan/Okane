# Project Changelog

## 2026-09-10 — MVP: Okane (React + NestJS)

Full rebuild from scratch after the earlier Laravel monolith attempt was scrapped in
favor of a decoupled React + NestJS architecture (see `plans/260909-1453-savings-goal-app-mvp/`,
cancelled, for the superseded attempt).

**Added — backend (`apps/api`)**
- pnpm workspace monorepo scaffold; NestJS + Prisma + PostgreSQL (Docker); fail-fast env
  validation at boot.
- JWT auth: register/login, 15-minute access tokens, 30-day rotating refresh tokens
  (hashed server-side, revocable).
- Goals & savings entries: CRUD, cross-currency progress math (remaining amount in both
  currencies, suggested monthly savings amount), manual entry logging with the FX rate
  frozen at log time.
- Exchange-rate module: live JPY/VND rate via `open.er-api.com`, a daily cron snapshot
  building the app's own rate history (no free API has real history for this pair),
  history/converter endpoints, user-scoped threshold alerts with crossing-only semantics.
- Global Decimal→string response serialization, per-user data isolation proven by e2e
  suites (every cross-user access returns 404), request validation whitelisting.

**Added — frontend (`apps/web`)**
- React 19 + Vite app shell: design tokens (light/dark, persisted), VI/JA i18n
  (persisted, react-i18next), routing, auth session plumbing with silent token refresh.
- Auth UI (login/register), Goals UI (dashboard, goal detail with the cross-currency FX
  helper, entry logging/history, create/edit/delete), Exchange & Convert UI (live rate
  ticker mounted app-wide, 7d/30d/1y history chart, quick converter, rate-alert
  management, an outbound link to Smiles Wallet for the actual money-transfer step).

**Fixed during Phase 10 hardening**
- `--ink-faint` design token failed WCAG AA contrast for body text in both themes
  (3.03:1 light / 3.72:1 dark against a 4.5:1 requirement) — corrected within the same
  hue to 4.50:1 / 4.53:1.
- (Carried from earlier phases, recorded here for a complete history) a Decimal
  serializer that never actually worked (`instanceof Decimal` failed across Prisma's
  bundled decimal.js copy — fixed via `Decimal.isDecimal()`), a snapshot-write race that
  could crash the app on concurrent cron triggers, and two API response shapes that had
  drifted from their documented contract (`GET /goals/:id/entries` pagination envelope,
  flat `goalName` on dashboard activity).

**Explicitly deferred** — see `docs/development-roadmap.md`.
