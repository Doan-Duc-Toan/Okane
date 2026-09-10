---
title: "Okane MVP — React + NestJS savings-goal app with JPY/VND FX"
description: "Decoupled React SPA + NestJS API for goal-based savings tracking with live JPY/VND rate, self-built rate history, and cross-currency goal math."
status: pending
work_type: feature
priority: P1
effort: 40h
branch: main (repo not yet initialized — created in Phase 1)
tags: [react, nestjs, prisma, postgres, fx, i18n, mvp]
created: 2026-09-10
blockedBy: []
blocks: []
---

# Plan: Okane MVP (React + NestJS)

## Overview
Savings-goal tracker for Vietnamese workers in Japan. Manual entry logging, multi-goal dashboard,
live JPY/VND rate with self-built history, cross-currency goal math, VI/JA UI, light/dark theme.
Solo build, ~1–1.5 weeks.

**Supersedes** [`260909-1453-savings-goal-app-mvp`](../260909-1453-savings-goal-app-mvp/plan.md)
(Laravel monolith, cancelled — that implementation was deleted). Nothing is carried over but the
document convention. Repo currently holds only `docs/` and `plans/`.

Context: [brainstorm](../reports/brainstorm-260909-1453-savings-app-idea.md) ·
[stack research](../reports/researcher-260910-1513-okane-stack-decisions.md)

## Stack (decided, not up for re-litigation)
- pnpm workspaces — `apps/web` (React) + `apps/api` (NestJS). No Nx/Turborepo yet.
- API: NestJS + Prisma + PostgreSQL (Docker). Modules: Auth, Users, Goals, SavingsEntries, ExchangeRate.
- Auth: JWT access (15m) + rotating refresh (30d, hashed server-side). Email/password only.
- Web: Vite + react-router v7 + TanStack Query + CSS custom properties/Modules + react-i18next + Recharts.
- FX: `open.er-api.com` live rate (verified 2026-09-10: VND present, base JPY, refreshes ~00:10 UTC
  daily) → snapshotted daily into our own `RateSnapshot` table, which powers chart *and* alerts.
- No Redis, no queue, no microservices. The DB *is* the FX cache — the source moves once a day.

## Phases

| # | Phase | Status | Effort | File |
|---|-------|--------|--------|------|
| 1 | Monorepo scaffold & local dev environment | pending | 2h | [phase-01-monorepo-scaffold-and-dev-environment.md](phase-01-monorepo-scaffold-and-dev-environment.md) |
| 2 | Prisma schema & data-isolation foundation | pending | 3h | [phase-02-prisma-schema-and-data-isolation.md](phase-02-prisma-schema-and-data-isolation.md) |
| 3 | Auth backend (JWT access + refresh) | pending | 4h | [phase-03-auth-backend-jwt.md](phase-03-auth-backend-jwt.md) |
| 4 | Goals & savings entries backend + goal math | pending | 6h | [phase-04-goals-and-entries-backend.md](phase-04-goals-and-entries-backend.md) |
| 5 | Exchange-rate backend (provider, cron, history, alerts) | pending | 5h | [phase-05-exchange-rate-backend.md](phase-05-exchange-rate-backend.md) |
| 6 | React app shell (tokens, theme, i18n, routing, API client) | pending | 5h | [phase-06-react-app-shell.md](phase-06-react-app-shell.md) |
| 7 | Auth UI (login, register, session handling) | pending | 3h | [phase-07-auth-ui.md](phase-07-auth-ui.md) |
| 8 | Goals UI (dashboard, goal detail, forms, history) | pending | 6h | [phase-08-goals-ui.md](phase-08-goals-ui.md) |
| 9 | Exchange & Convert UI (rate, chart, converter, alerts) | pending | 4h | [phase-09-exchange-and-convert-ui.md](phase-09-exchange-and-convert-ui.md) |
| 10 | Integration, QA & hardening | pending | 2h | [phase-10-integration-qa-and-hardening.md](phase-10-integration-qa-and-hardening.md) |

## Key dependencies

```
1 ──┬─→ 2 ──┬─→ 3 ──→ 4 ──┐
    │       └─→ 5 ────────┼─→ 10
    └─→ 6 ──┬─→ 7 ────────┤
            ├─→ 8 ────────┤
            └─→ 9 ────────┘
```
- Phase 6 needs only Phase 1 → **backend track (2–5) and frontend track (6–9) run in parallel.**
- Phase 5 needs Phase 3 only for `userId` on rate alerts; the snapshot cron is independent.
- Phase 4 has a **soft** dependency on Phase 5's `getLatestRate()` signature only — its math is
  unit-tested with an injected rate, so it builds against a stub and is wired at the end.
- Phases 7/8/9 build against the contracts frozen in Phases 3/4/5.
- Only two shared files, both append-only: `apps/api/src/app.module.ts` (one import per backend
  phase) and `apps/web/src/app/routes.tsx` (one route per UI phase) — Phases 1 and 6 pre-declare
  every slot so parallel phases never restructure them.

## Testing posture & local DB
Coverage % is not a gate. Tested because being wrong is expensive: **goal/FX math** (Jest unit),
**per-user data isolation** (e2e — every cross-user access must 404), **token rotation**, **money
formatting** (Vitest). Manual journey QA in Phase 10; no Playwright in MVP.
Local DB: Docker Postgres, `okane` + `okane_test` — the only workable option on this machine
(no psql/Postgres.app/Homebrew Postgres installed; Docker daemon confirmed running).

## Success criteria (MVP done)
Register → create a goal in JPY or VND → log entries in *either* currency (converted and frozen at
the logging rate) → accurate progress %, "how much more I need" in both currencies, suggested
monthly amount → live rate + growing history chart + converter + a threshold alert that fires on
crossing — all in VI or JA, light or dark, with zero cross-user leakage (proven by the isolation suite).

## Backlog (explicitly NOT in this plan)
Google OAuth (button rendered but disabled — Phase 7), alert delivery (email/push), login rate
limiting, deployment + CSP/helmet, data export, furusato-nozei/nenkin content, PWA/native mobile,
Playwright E2E, FX historical backfill (paid APIs — deliberately declined).

## Next steps
Run `/tkm:takumi` against this directory. Status column is updated per phase
(`ck` CLI is not installed on this machine — edit the Status column in this file directly).
