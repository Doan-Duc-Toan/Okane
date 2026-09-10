# Okane

Savings-goal tracker for Vietnamese workers in Japan: create goals in JPY or VND, log
savings in either currency (converted and frozen at the logging rate), track progress
against a deadline, and watch a live JPY⇄VND rate with a self-built history chart,
converter, and threshold alerts.

## Stack

- `apps/api` — NestJS + Prisma + PostgreSQL. Modules: `auth`, `users`, `goals`,
  `savings-entries`, `exchange-rate`.
- `apps/web` — React 19 + Vite + react-router v7 + TanStack Query + react-i18next
  (VI/JA) + Recharts, styled from CSS custom-property design tokens with light/dark
  themes.
- pnpm workspaces monorepo — no Nx/Turborepo (see `docs/system-architecture.md` for why).

## Prerequisites

- Node **24** (see `.nvmrc`)
- Corepack (ships with Node — enables pnpm without a separate install)
- Docker Desktop (or another OCI runtime — OrbStack and Colima have both been used on
  this project; whichever you use, its daemon must actually be running before `pnpm db:up`)

## Setup

```sh
corepack enable pnpm
pnpm install
pnpm db:up                          # starts Postgres in Docker
cp apps/api/.env.example apps/api/.env
# then fill in JWT_ACCESS_SECRET and JWT_REFRESH_SECRET, e.g.:
#   openssl rand -base64 48
# (generate two distinct values — never reuse one secret for both tokens)
pnpm --filter api exec prisma migrate deploy
pnpm dev                             # starts api (:3000) and web (:5173) together
```

Visit `http://localhost:5173`. The Vite dev server proxies `/api/*` to Nest on `:3000` —
no CORS setup needed in dev.

## Scripts (run from the repo root)

| Script | What it does |
|---|---|
| `pnpm dev` | Runs `api` and `web` dev servers together (`pnpm -r --parallel run dev`) |
| `pnpm build` | Builds both workspaces (`pnpm -r run build`) |
| `pnpm test` | Runs both workspaces' test suites (unit only — see below for e2e) |
| `pnpm lint` | Lints both workspaces |
| `pnpm db:up` / `pnpm db:down` | Start / stop the Postgres container |
| `pnpm db:reset` | Drops the container volume and recreates it — **only safe pre-launch**, see `docs/data-model.md` |

Per-workspace (from `apps/api`): `pnpm run test:e2e` runs the API's integration/isolation
suite against `okane_test` (uses `.env.test`, never the dev database).

## Troubleshooting

- **Port 5432 already in use.** Another project's Postgres may already hold the default
  port. This repo's `docker-compose.yml` maps to host port **5433** instead — the
  `DATABASE_URL` in every `.env*` file already points there. If you free up 5432 and want
  the default back, change both the compose mapping and the env files together.
- **`docker compose up` hangs or the daemon seems stuck.** If you're on Colima via
  Homebrew's launchd service and it's crash-looping, switching to OrbStack (or Docker
  Desktop) resolved this during development. Check `docker context ls` / `docker info`
  to see which runtime is actually active.
- **No `psql` on this machine.** You don't need one installed — use the running
  container's own client: `docker compose exec db psql -U okane -d okane`.
- **App boots but immediately errors about config.** `@nestjs/config` validates required
  env vars at boot and fails fast with a readable message (by design — see
  `apps/api/src/config/env.validation.ts`). The message names the missing/invalid key.
- **e2e tests seem to be touching the wrong database.** `@prisma/client` loads `.env` as
  an import-time side effect before anything else runs, and dotenv never overrides an
  already-set variable — so a naive `NODE_ENV=test` override can silently lose to `.env`.
  This project's fix (`apps/api/test/setup-e2e-env.ts`, loaded via `vitest.config.e2e.ts`
  `setupFiles`) forces `.env.test` first; if you add a new test entry point, load that
  setup file too.

## Plans & docs

- `plans/260910-1521-okane-react-nestjs-mvp/plan.md` — the full build plan and phase files
- `docs/system-architecture.md` — module map, request flow, key architectural decisions
- `docs/data-model.md` — schema and the per-user data-isolation contract
- `docs/project-changelog.md` — what shipped, in order
- `docs/development-roadmap.md` — MVP status and what's next
