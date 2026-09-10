# Okane

Savings-goal tracker for Vietnamese workers in Japan, with live JPY/VND exchange rate,
self-built rate history, and cross-currency goal math.

## Stack

- `apps/api` — NestJS + Prisma + PostgreSQL
- `apps/web` — React + Vite + react-router + TanStack Query

## Setup

```sh
corepack enable pnpm
pnpm install
pnpm db:up      # starts Postgres in Docker
pnpm dev        # starts both api (:3000) and web (:5173)
```

Copy `.env.example` → `.env` in `apps/api` (and `apps/web` if needed) before first run.

**Note:** Postgres is mapped to host port **5433** (not the default 5432) because another
project's container on this machine already holds 5432. `DATABASE_URL` in the `.env*` files
already points at 5433 — only change it if you free up 5432 and prefer the default.

## Plan

See `plans/260910-1521-okane-react-nestjs-mvp/plan.md` for the full build plan and phase files.
