---
status: cancelled
work_type: deliverable
spec_waived: personal solo greenfield project, SDD mode off — spec formality skipped per user brainstorm session (see reports/brainstorm-260909-1453-savings-app-idea.md)
blockedBy: []
blocks: []
---

> **Superseded (2026-09-10):** user deleted the Laravel implementation and restarted from a
> mockup-first approach with a new stack decision — React (FE) + NestJS (BE). See the new plan
> directory for the current build. Kept here only as historical record.

# Plan: Savings Goal App (MVP) — Laravel (cancelled)

## Overview
Web app for goal-based savings tracking, targeted at Vietnamese workers in Japan
(house purchase, debt payoff, etc.). Solo personal project, intended for eventual
public launch. MVP = smallest usable version, manual data entry only, ~1-2 weeks.

Context: [brainstorm-260909-1453-savings-app-idea.md](../reports/brainstorm-260909-1453-savings-app-idea.md)

**Stack revision (2026-09-09):** originally Next.js + Supabase; switched to Laravel
per user's own PHP/Ruby familiarity (stronger than JS/TS) at the start of implementation.

## Stack
- Laravel 11 (PHP 8.3), Blade + Tailwind CSS — no separate frontend framework needed for MVP
- MySQL — Laravel's default convention, widest hosting support
- Auth: Laravel Breeze (Blade stack) + Laravel Socialite for Google login
- Data isolation: Eloquent global scope auto-filtering by `user_id` (no DB-level RLS
  available outside Postgres/Supabase — app-layer scope + Policy checks instead)
- Deploy: Railway (simple git-push deploy, managed MySQL)

## Explicitly out of scope (MVP)
Recurring reminders, savings trend charts, JPY↔VND conversion, bank CSV import,
localized content (furusato nozei/nenkin tips), multi-language UI, PWA/mobile.
These are backlog for phase 2/3 — do not implement now.

## Phases

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Project setup & infra | partial — app scaffolded locally, git/GitHub/Railway not done | [phase-01-project-setup.md](phase-01-project-setup.md) |
| 2 | Database schema & data isolation | done | [phase-02-database-schema.md](phase-02-database-schema.md) |
| 3 | Authentication | partial — code done, needs real Google OAuth credentials | [phase-03-authentication.md](phase-03-authentication.md) |
| 4 | Savings goals CRUD | done | [phase-04-goals-crud.md](phase-04-goals-crud.md) |
| 5 | Savings entries (manual logging) | done | [phase-05-savings-entries.md](phase-05-savings-entries.md) |
| 6 | Dashboard & history UI | done | [phase-06-dashboard-ui.md](phase-06-dashboard-ui.md) |
| 7 | QA & deploy | partial — local manual QA passed, production deploy not done | [phase-07-qa-deploy.md](phase-07-qa-deploy.md) |

## Key dependencies
- Phase 2 depends on Phase 1 (Laravel app + MySQL DB must exist)
- Phase 3 depends on Phase 2 (auth needs the `users` table + migrations in place)
- Phases 4 & 5 depend on Phase 3 (need authenticated user context + isolation scope)
- Phase 6 depends on Phases 4 & 5 (needs data to display)
- Phase 7 depends on all prior phases

## Success criteria (MVP done)
User can sign up, log in, create a savings goal (name/target/deadline/currency),
manually log savings entries against it, and see progress % + history on a
dashboard — deployed and reachable via a public Railway URL.

## Next steps
Run `/tkm:takumi` against this plan directory to implement phase by phase.
