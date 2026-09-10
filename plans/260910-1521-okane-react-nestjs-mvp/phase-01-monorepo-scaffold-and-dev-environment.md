# Phase 1: Monorepo Scaffold & Local Dev Environment

## Context Links
- Plan overview: [plan.md](plan.md)
- Stack research: [researcher-260910-1513-okane-stack-decisions.md](../reports/researcher-260910-1513-okane-stack-decisions.md)
- Depends on: nothing (first phase)

## Overview
- **Priority:** Blocking — every other phase needs the workspace, the DB, and the run scripts.
- **Status:** pending
- **Effort:** 2h
- Create the pnpm workspace with `apps/web` (Vite React TS) and `apps/api` (NestJS),
  a Dockerized Postgres with a dev **and** a test database, env plumbing, and one command
  that boots the whole stack.

## Key Insights
Machine facts verified 2026-09-10 on this Mac — the plan is built around them, do not re-assume:
- Node **v24.19.0** present, npm 11.17.0 present.
- **`pnpm` is NOT installed.** Node 24 ships Corepack → enable it rather than a global npm install.
- **Docker 29.1.5 CLI, daemon running (server 28.4.0)** → Dockerized Postgres is the simplest
  workable local DB.
- **No `psql`, no Postgres.app, no Homebrew Postgres.** Prisma does not need a `psql` client;
  when a shell is genuinely wanted, use `docker compose exec db psql -U okane`.
- **Not a git repository yet** — `git init` is part of this phase.
- Stale `node_modules/` and `vendor/` sit at the repo root from the deleted Laravel app. They are
  inert; `.gitignore` covers `node_modules`, and `vendor/` should simply be deleted (nothing reads it).

## Requirements
**Functional**
- `pnpm dev` starts API (`:3000`) and web (`:5173`) together; web proxies `/api/*` to the API.
- `pnpm db:up` / `pnpm db:down` control the Postgres container.
- Both apps type-check and build from a cold clone in under ~5 minutes.

**Non-functional**
- No CORS configuration needed in dev (Vite proxy handles it); CORS only wired for prod origins.
- Every source file stays under 200 lines (project rule) — enforced by module granularity, not tooling.
- `.env` files never committed; `.env.example` always committed and in sync.

## Architecture
```
Okane/
├── package.json                # root: scripts only, private:true, packageManager pin
├── pnpm-workspace.yaml         # packages: apps/*
├── docker-compose.yml          # postgres:17-alpine, volume, healthcheck
├── .gitignore  .editorconfig  .nvmrc  README.md
├── apps/
│   ├── api/                    # NestJS
│   │   ├── src/{main.ts,app.module.ts,config/env.validation.ts}
│   │   ├── .env  .env.example
│   │   └── package.json  tsconfig.json  nest-cli.json
│   └── web/                    # Vite + React + TS
│       ├── src/{main.tsx,app/}
│       ├── .env.example
│       └── package.json  vite.config.ts  tsconfig.json
```

**Request flow in dev**
```
browser :5173 ──/api/goals──▶ Vite dev server (proxy, rewrite /api → /)
                                   └──▶ Nest :3000 ──▶ Prisma ──▶ Postgres :5432 (docker)
```
Same-origin in the browser ⇒ no preflight, no CORS headers, no cookie-domain issues.

**Port/DB allocation**
| Thing | Value | Note |
|---|---|---|
| Web dev server | 5173 | Vite default |
| API | 3000 | `PORT` env |
| Postgres | 5432 | host-mapped from container |
| Dev DB | `okane` | `DATABASE_URL` |
| Test DB | `okane_test` | `DATABASE_URL` in `.env.test`, reset per e2e run |

## Related Code Files
**Create:**
- `package.json`, `pnpm-workspace.yaml`, `docker-compose.yml`, `.gitignore`, `.editorconfig`, `.nvmrc`, `README.md`
- `apps/api/` — full Nest scaffold; `apps/api/src/config/env.validation.ts`; `apps/api/.env.example`
- `apps/web/` — full Vite scaffold; `apps/web/vite.config.ts`; `apps/web/.env.example`

**Modify:** none (greenfield).

**Delete:**
- `/Users/doan.duc.toan/Documents/Okane/vendor/` and `/Users/doan.duc.toan/Documents/Okane/node_modules/`
  (leftovers from the cancelled Laravel build; removing them prevents confusing IDE/grep noise).

## Implementation Steps
1. `corepack enable pnpm && corepack prepare pnpm@latest --activate`; confirm `pnpm -v`.
2. `git init`; write `.gitignore` (`node_modules/`, `dist/`, `.env`, `.env.*` except `.env.example`,
   `*.log`, `.DS_Store`, `apps/api/prisma/*.db`). Write `.nvmrc` (`24`).
3. Delete the stale `vendor/` and root `node_modules/`.
4. Root `package.json`: `private: true`, `"packageManager": "pnpm@<pinned>"`, scripts:
   `dev` (parallel `-r dev`), `build`, `lint`, `test`, `db:up`, `db:down`, `db:reset`.
   Use `pnpm -r --parallel run dev` — no extra concurrency dependency needed.
5. `pnpm-workspace.yaml` → `packages: ["apps/*"]`.
6. `docker-compose.yml`: `postgres:17-alpine`, `POSTGRES_USER=okane`, `POSTGRES_PASSWORD=okane`,
   `POSTGRES_DB=okane`, named volume `okane-pgdata`, port `5432:5432`, `healthcheck: pg_isready`.
   Add an init script that also creates `okane_test`.
7. Scaffold API: `pnpm dlx @nestjs/cli new api --package-manager pnpm --skip-git` inside `apps/`.
   Strip the generated sample controller/service down to a bare `AppModule`.
8. In `apps/api/src/main.ts`: global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true,
   transform: true })`, global prefix `api`, `app.enableCors` **only** when `CORS_ORIGINS` is set,
   listen on `PORT ?? 3000`.
9. `@nestjs/config` with `isGlobal: true` + `validate:` pointing at `env.validation.ts` — fail fast
   at boot on a missing/short secret. Declare (unused ones land in later phases):
   `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_TTL=15m`,
   `JWT_REFRESH_TTL=30d`, `PORT=3000`, `NODE_ENV`, `CORS_ORIGINS` (optional),
   `FX_API_URL=https://open.er-api.com/v6/latest/JPY`, `FX_SNAPSHOT_CRON=0 1 * * *`.
10. Write `apps/api/.env.example` with every key and placeholder values; generate real secrets into
    `.env` with `openssl rand -base64 48` (two distinct values — never reuse one secret for both tokens).
11. Scaffold web: `pnpm create vite@latest web -- --template react-ts` inside `apps/`.
12. `apps/web/vite.config.ts`: `server.proxy` → `{ '/api': { target: 'http://localhost:3000', changeOrigin: true } }`.
    Note the API's global prefix is also `api`, so **no path rewrite** — `/api/goals` maps straight through.
13. `apps/web/.env.example` → `VITE_API_URL=` (blank in dev; set only for prod builds).
    Comment it: `VITE_*` values are baked into the client bundle — never put a secret here.
14. Create `apps/api/src/app.module.ts` with a commented import slot per upcoming module and
    `apps/web/src/app/routes.tsx` placeholder, so parallel phases append rather than restructure.
15. Verify: `pnpm db:up` → healthy; `pnpm dev` → API responds on `:3000/api`, web loads on `:5173`,
    and a browser fetch to `/api` from `:5173` reaches Nest. `pnpm build` green in both apps.
16. First commit: `chore: scaffold pnpm monorepo with nestjs api and vite react web`.

## Todo List
- [ ] Corepack/pnpm enabled and version pinned in root `package.json`
- [ ] `git init` + `.gitignore` (`.env` excluded, `.env.example` tracked)
- [ ] Stale `vendor/` and root `node_modules/` deleted
- [ ] `pnpm-workspace.yaml` + root scripts (`dev`, `build`, `lint`, `test`, `db:up/down/reset`)
- [ ] `docker-compose.yml` with `okane` + `okane_test` databases and a healthcheck
- [ ] NestJS scaffolded: global ValidationPipe, `api` prefix, validated config
- [ ] `.env` generated with two distinct 48-byte secrets; `.env.example` committed and complete
- [ ] Vite scaffolded with `/api` proxy; `VITE_API_URL` documented as public
- [ ] `app.module.ts` and `routes.tsx` created with pre-declared extension slots
- [ ] `pnpm dev` boots both apps; cross-app proxy request verified; `pnpm build` green
- [ ] Initial commit made

## Success Criteria
- From a clean shell: `pnpm install && pnpm db:up && pnpm dev` yields a working web page at
  `:5173` whose `/api` fetch is served by Nest — measured by an actual browser/network check, not assumed.
- `pnpm build` exits 0 for both workspaces.
- Booting the API with `JWT_ACCESS_SECRET` removed **fails immediately with a readable message**
  (proves fail-fast config validation, which is the whole point of step 9).

## Risk Assessment
| Risk | Likelihood | Impact | Countermove |
|---|---|---|---|
| Port 5432 already bound by another container/service | Medium | Low | Map host `5433:5432` and update `DATABASE_URL`; document in README |
| `create vite` / `nest new` scaffold drift (templates change) | Medium | Low | Accept whatever the current template emits; only enforce the config in steps 8–13 rather than a fixed file list |
| Corepack signature/registry hiccup on `pnpm` activation | Low | Medium | Fallback `npm i -g pnpm`; record which route was used in README |
| Docker daemon not running on a later day | Medium | Low | `pnpm db:up` fails loudly; README states Docker Desktop must be running |
| Version pins unverified against Sept-2026 changelogs (flagged in stack research) | Medium | Low | Install latest at scaffold time; if a major breaks, pin down one major and note it |

**Rollback:** whole phase is additive to an empty repo — `git reset --hard` / delete `apps/` and
`docker compose down -v`. Nothing downstream exists yet to cascade.

## Security Considerations
- `.env` gitignored from the very first commit — a secret committed once lives in history forever.
- Two independent JWT secrets (access vs refresh) so leaking one does not mint the other.
- `VITE_*` variables are compiled into the public bundle: only the API base URL ever goes there.
- Postgres is bound to localhost via Docker port mapping; dev credentials are throwaway and must
  not be reused for any deployed environment.

## Next Steps
→ Phase 2 (Prisma schema) needs the running Postgres and the validated `DATABASE_URL`.
→ Phase 6 (React shell) needs only the Vite scaffold and can start in parallel immediately.
