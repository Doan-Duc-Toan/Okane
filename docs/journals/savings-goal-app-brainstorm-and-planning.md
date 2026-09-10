# Savings Goal App: Brainstorm & Planning Session

**Date**: 2026-09-09 14:53
**Severity**: Medium (project inception; major stack & scope decisions)
**Component**: Project planning, architecture decision
**Status**: Ready for implementation

## What Happened

Started with a raw idea: a web app to help Vietnamese workers in Japan track and hit savings goals (house down payment, debt repayment, remittance goals). Ran a full brainstorm loop to validate the idea, then generated a 7-phase implementation blueprint ready for execution.

## The Brutal Truth

The Japanese personal finance app market is crowded — Zaim, Moneytree, MoneyForward all own pieces of it. Trying to compete on "budgeting features" is pointless. But the niche is real: Vietnamese workers in Japan (and other Southeast Asian migrant workers) juggle **JPY/VND currency split, remittance windows, tax refund timing, and specific savings milestones that don't map to typical Japanese salaryman needs**. That gap is wide open. The risk isn't whether the market exists — it's whether a solo builder can ship fast enough to reach it before burnout.

## Technical Details

**Stack chosen**: Next.js (TypeScript) + Supabase (Postgres + Auth + Row Level Security) + Vercel

**Why this stack, not others:**
- **Next.js + Supabase**: paired for speed — Auth, database, and RLS all bundled; no custom session middleware, no separate DB ops; Vercel deploy is push-to-main
- **Postgres underneath Supabase**: avoids hard vendor lock-in; can migrate to self-hosted if needed later
- **RLS policies**: per-user data isolation baked into the database layer — financial data stays private without custom application logic
- **Deployment on Vercel**: zero config for a next-js-site, edge functions if needed, deploy previews for testing

**MVP scope (1–2 weeks, solo)**:
- User auth (email + password via Supabase Auth)
- Manual savings goal creation (target amount, target date, currency: JPY or VND)
- Manual entry logging (add/deduct savings, timestamp, note)
- Simple dashboard (current progress, goal timeline, balance)
- Savings history view

**Explicitly deferred** (phase 2/3 backlog, NOT MVP):
- Recurring reminders, email notifications
- Savings trend charts / analytics
- Currency conversion (JPY ↔ VND)
- Bank statement CSV import
- Localized tips (furusato nozei, nenkin refund guides)
- Multi-language UI, PWA/mobile native

## What We Tried

Tested the idea against three alternatives:
1. **Expense-first design** (track spending, then derive savings) — rejected, user wants to set goal-driven targets, not reverse-engineer from budget
2. **Multi-tenant SaaS** (full feature parity with MoneyForward, charge monthly) — rejected, too broad for solo, too long to ship
3. **Simple wallet tracker** (generic savings tracker, no goal context) — considered but chose goal-centric instead — aligns with user intent

## Root Cause Analysis

Why start here instead of elsewhere? The user already knows full-stack and wants to ship a **real public product**, not a learning exercise. That constraint forced clarity: 1–2 week timeline means every feature either lands in MVP or is cut. No edge cases, no premature optimization, no "nice-to-have" infrastructure.

The stack choice reflects that pressure too. A less-integrated stack (separate Auth service + bare Postgres + custom RLS logic) would add weeks of plumbing. Supabase collapses that work into config.

## Lessons Learned

1. **Niche is the strategy.** Crowded markets reward focus. "Savings app for Japanese workers" loses. "Savings app for Vietnamese workers managing JPY/VND split and remittance goals" wins because it's the whole game for those users.

2. **Bundled tooling pays off for solo builders.** The temptation is always to hand-roll auth or use a lighter DB. Resist it. Supabase's opinionated stack is exactly right when speed matters more than architectural purity.

3. **Deferral is not failure.** Charts, reminders, multi-currency, localized content — all real features, all useful. They live in the phase 2 backlog, not in the trash. MVP clarity means saying "not yet" with a clear plan to return.

## Next Steps

1. **User runs `tkm:takumi`** against the plan at `/Users/doan.duc.toan/Documents/Okane/plans/260909-1453-savings-goal-app-mvp/` to start implementation phase by phase
2. **Phase 1**: Supabase project setup, Postgres schema, RLS policies
3. **Phases 2–6**: Auth, CRUD endpoints, dashboard UI, manual entry logging
4. **Phase 7**: QA and deploy to Vercel
5. **Success metric**: Public MVP running, accepting first real users by end of week 2

**Artifacts**:
- Brainstorm report: `/Users/doan.duc.toan/Documents/Okane/plans/reports/brainstorm-260909-1453-savings-app-idea.md`
- Implementation plan: `/Users/doan.duc.toan/Documents/Okane/plans/260909-1453-savings-goal-app-mvp/`
  - `plan.md` (overview)
  - `phase-01-setup-and-infrastructure.md` through `phase-07-qa-and-deployment.md`

The fog is cleared. Time to forge.
