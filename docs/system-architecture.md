# System Architecture

## Shape

Decoupled SPA + API, not a monolith — the explicit reason is that a future mobile app
(React Native or otherwise) can call the same NestJS API without any backend change.

```
apps/
├── api/   NestJS — REST API, Prisma/PostgreSQL, JWT auth, FX cron
└── web/   React SPA — Vite, react-router, TanStack Query
```

pnpm workspaces, no Nx/Turborepo. At two apps and one developer, a build-orchestration
tool has nothing to cache or parallelize that pnpm's own `-r --parallel` doesn't already
do — it's the kind of infrastructure that earns its cost at a third app (e.g. a real
mobile client), not before. Revisit then.

## Request flow (dev)

```
browser :5173 ──/api/*──▶ Vite proxy ──▶ Nest :3000 ──▶ Prisma ──▶ Postgres :5433 (Docker)
```

Same-origin from the browser's point of view in dev (the Vite proxy handles it) — no
CORS, no cookie-domain complexity. `app.enableCors()` only activates when `CORS_ORIGINS`
is set, which is a production concern once the web app and API are on different origins.

## API module map (`apps/api/src/`)

| Module | Owns |
|---|---|
| `auth` | Register/login, JWT access (15m) + rotating hashed refresh (30d), guards |
| `users` | User profile (locale, theme preference) |
| `goals` | Goal CRUD, cross-currency progress math (remaining amount in both currencies, suggested monthly amount) |
| `savings-entries` | Logging contributions against a goal; freezes the FX rate at log time |
| `exchange-rate` | Live-rate proxy, daily snapshot cron, history query, converter, user-scoped rate alerts |
| `common` | Cross-cutting: `RATE_PROVIDER` seam (see below), the global Decimal→string response interceptor, the Prisma error filter |
| `prisma` | The Prisma client wrapped as a Nest provider |
| `config` | Startup env validation — the app refuses to boot with a missing/short JWT secret rather than run insecurely |

Every route requires a valid access token by default (`APP_GUARD` binds `JwtAuthGuard`
globally) — a new controller is protected the moment it exists, not opt-in per route.

### The `RATE_PROVIDER` seam

`goals` and `savings-entries` need the live FX rate for cross-currency math, but the
module that actually owns fetching/caching that rate (`exchange-rate`) was built in
parallel by a different work-track and didn't exist yet when `goals` was designed. Both
sides depend only on a small interface (`getLatestRate()`), bound in one file
(`common/rate-provider.module.ts`). `goals`/`savings-entries` were built and tested
against a stub implementing that interface; `exchange-rate`'s `ExchangeRateService`
implements the same interface for real and is wired in by swapping one binding — no
consumer code changed when the real implementation landed.

## Why the FX rate is cached in our own table, not a live API call per request

`open.er-api.com` gives a free, no-key current JPY→VND rate — but it has no historical
endpoint, and no free FX API found during research has real historical depth for this
specific pair (VND is dropped by several providers entirely, including Frankfurter/ECB).
So `RateSnapshot` isn't a performance cache, it's the *only* source of history: a daily
`@nestjs/schedule` cron snapshots the rate into Postgres, and the 7d/30d/1y chart plus
the threshold-alert evaluator both read from that table, never from the live API
directly. No Redis, no queue — the external source only moves once a day, so the
database is already as fresh as it can ever be. History starts thin at launch and grows
one row per day; a paid historical backfill was deliberately declined for MVP.

The snapshot write is wrapped in its own try/catch, independent of the provider-fetch
try/catch: a losing race on the `(base, quote, capturedOn)` unique constraint (two
snapshot attempts landing in the same window) is a logged no-op, not a crash.

## Web app structure (`apps/web/src/`)

| Directory | Owns |
|---|---|
| `app/` | Router table (`routes.tsx`) and route-guard components (`ProtectedRoute`, `PublicOnlyRoute`) |
| `features/{auth,goals,exchange}/` | Screen-level pages, feature-scoped API clients/hooks, feature-local components |
| `components/{layout,ui}/` | Cross-feature shell (`AppShell`, persistent rate ticker) and shared primitives (inputs, the ledger-row list pattern, select) |
| `contexts/` | `auth-context` (in-memory access token + localStorage refresh token, single-flight silent refresh), `theme-context` (light/dark/system, persisted) |
| `i18n/` | `react-i18next` setup + `locales/{vi,ja}.json` — every user-facing string ships bilingual from the start, not backfilled later |
| `styles/tokens.css` | The design-token source (see `plans/260910-1521-okane-react-nestjs-mvp/mockup-design-tokens.md` for provenance and the WCAG contrast correction applied in Phase 10) |
| `lib/` | `api-client.ts` (fetch wrapper, token attach + refresh), `format.ts` (money/rate/date formatting — the last line of defense against a malformed numeric value) |

### Token strategy

Access token lives in an in-memory module variable (`api-client.ts`) — never
`localStorage`, never a log line. Refresh token lives in `localStorage` (accepted
tradeoff for a web SPA with no backend-for-frontend to hold an httpOnly cookie) with
rotation: each refresh issues a new refresh token and invalidates the old one
server-side, so a stolen-and-replayed old token is detectable. A single-flight guard
on the client prevents concurrent requests from each independently triggering a refresh
(which would otherwise look like refresh-token reuse and trip the revocation logic).

## Data isolation

Prisma has no row-level security. Every user-owned model (`Goal`, `SavingsEntry`,
`RateAlert`) is scoped in the service layer by query *shape*, not by convention — see
`docs/data-model.md` for the exact required shape per operation and why a foreign-owned
resource always 404s, never 403s.

## Testing posture

Coverage percentage is not a gate; the goal is that expensive-to-be-wrong code is
tested: goal/FX math (unit), per-user data isolation (e2e, proven with two seeded users
against every user-owned endpoint), token rotation (e2e), money/rate formatting (unit).
Manual journey QA covers the rest for this MVP — no Playwright/browser E2E yet (backlog).

## Deliberately deferred (see `docs/development-roadmap.md` for order)

Login rate limiting, CSP/security headers, Google OAuth, alert delivery (email/push),
data export, recurring reminders, PWA/native mobile, deployment.
