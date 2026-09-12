# Project Changelog

## 2026-09-12 — iOS home-screen install (PWA, `apps/web`)

`apps/web` is now installable to an iPhone home screen via Safari's "Add to Home Screen" (no
App Store, no `apps/api` change — see `plans/260912-1931-pwa-ios-install/`).

**Added — frontend (`apps/web`)**
- `vite-plugin-pwa` (`generateSW`/Workbox): inline manifest (name, icons, standalone display,
  brand theme/background colors), a service worker precaching the built app shell
  (JS/CSS/HTML/SVG/woff2) plus a Google Fonts runtime cache. `/api/**` is excluded from both the
  precache and the navigate fallback — the service worker never intercepts an API request.
- Four brand-mark PNG icons (apple-touch-icon, icon-192/512, maskable-512) generated from an
  HTML/CSS rendering of the real mark via a one-off `puppeteer-core` script
  (`apps/web/scripts/generate-pwa-icons.mjs`, not wired into the build).
- iOS meta tags in `index.html` (apple-touch-icon, `apple-mobile-web-app-capable`, status bar
  style, light/dark `theme-color`).
- `UpdatePrompt` (`useRegisterSW`, `registerType: 'prompt'`): a dismissible bar that appears when
  a new build is waiting, so an installed app doesn't stay stuck on stale cached code.

**Not yet verified** — Phase 4 of the plan (the real-iPhone install/offline/update walkthrough)
hasn't run. Everything above is implemented and committed but unproven on an actual device; see
the Todo List in `plans/260912-1931-pwa-ios-install/phase-04-ios-device-verification.md`.

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
