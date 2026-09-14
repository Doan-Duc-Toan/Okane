---
title: "Available balance + goal allocation"
description: "Declare a monthly income and a few fixed expenses, see what's left after every goal's monthly ask, and split a lump sum across goals in one action."
status: pending
work_type: feature
priority: P2
effort: 9h
branch: main
tags: [budget, allocation, prisma, nestjs, react, i18n, currency]
created: 2026-09-14
blockedBy: []
blocks: []
---

# Plan: Available balance + goal allocation

## Overview
Today Okane answers "how is each goal doing?". It cannot answer "can I actually afford all of
them this month?". This feature adds the missing side of the ledger: a **monthly income** figure
and **three fixed expense totals** the user edits in a settings form, from which we compute
`available = income − fixedExpenses − Σ(suggestedMonthlyAmount of every goal that has one)`, plus
an advisory split when that sum overruns.

This is **not** a budgeting app. No itemized transactions, no categories, no recurring-bill
scheduling, no spending analytics, no new ledger concept. One new table, one new pure math module,
four endpoints, three screens.

## The three decisions that shape everything

**1. `suggestedMonthlyAmount !== null` *is* the "active goal" filter.** No new activeness concept.
`GoalMathService` already returns `null` for a goal with no deadline **and** for an overdue goal
(`computeMonthsRemaining` returns null when the deadline is past). A completed goal returns `0`.
So "goals with a monthly ask" is exactly `suggestedMonthlyAmount != null && > 0`, which is by
construction `deadlineStatus === 'on_track'` with remaining > 0. Everything else is listed
separately as *not counted*, with its reason, so the number is always explainable. We never invent
a monthly figure for a deadline-less goal — there is no month to spread it over.

**2. Money is declared in ONE user-chosen budget currency.** Income and expenses are a single
`budgetCurrency` (JPY or VND). Every goal's monthly ask is converted into it with the existing
`convertAmount` + `RATE_PROVIDER` seam. If a conversion is needed and no rate exists, the endpoint
returns the block with `rateUnavailable: true` and `available: null` — it does **not** throw 503.
This is a read-only display number; degrading is correct. The *write* path (the split) keeps the
existing 503 `rateUnavailable`, because writing an unconverted amount corrupts a goal permanently.

**3. "Confirming" an allocation does not get its own endpoint — it routes into the split.**
The monthly allocation is advisory and never persisted. Pressing *Apply* opens the lump-sum split
screen pre-filled with the suggested per-goal amounts; the user reviews, adjusts, submits, and
`POST /api/entries/split` writes one `SavingsEntry` per goal. One write path serves both "I got a
bonus" and "apply my monthly plan" (DRY), no allocation-plan table (YAGNI), and a `SavingsEntry`
keeps meaning *money actually set aside* rather than *money a formula suggested*.
See [phase-03](phase-03-backend-budget-endpoints.md) and [phase-04](phase-04-backend-multi-goal-split.md).

## Phases

| # | Phase | Status | Effort | File |
|---|-------|--------|--------|------|
| 1 | Prisma: `BudgetSettings` table + additive migration | pending | 0.5h | [phase-01-prisma-budget-settings.md](phase-01-prisma-budget-settings.md) |
| 2 | Pure `BudgetMathService` + unit tests (no Prisma, no HTTP) | pending | 1.5h | [phase-02-budget-math-module.md](phase-02-budget-math-module.md) |
| 3 | Backend: budget module, DTOs, `GET/PUT /budget`, `GET /budget/available` | pending | 1.5h | [phase-03-backend-budget-endpoints.md](phase-03-backend-budget-endpoints.md) |
| 4 | Backend: multi-goal split — `POST /entries/split` | pending | 1h | [phase-04-backend-multi-goal-split.md](phase-04-backend-multi-goal-split.md) |
| 5 | Frontend: settings form, dashboard card, split flow, VI/JA | pending | 3h | [phase-05-frontend-budget-and-split.md](phase-05-frontend-budget-and-split.md) |
| 6 | E2E tests, docs, production migration verification | pending | 1.5h | [phase-06-tests-docs-rollout.md](phase-06-tests-docs-rollout.md) |

## Key dependencies

```
1 (schema) ──┐
             ├──→ 3 (budget endpoints) ──┐
2 (math) ────┘                           ├──→ 5 (frontend) ──→ 6 (e2e + docs)
4 (split) ───────────────────────────────┘                        ▲
                                                                  │
        4 ────────────────────────────────────────────────────────┘
```
- **1, 2 and 4 are all parallel-runnable from a cold start.** Phase 2 is pure TypeScript with zero
  imports from Prisma; Phase 4 touches only `savings-entries/`; Phase 1 touches only `prisma/`.
- Phase 3 needs 1's table and 2's math service.
- Phase 5 needs the **frozen wire contracts** in Phase 3 and Phase 4 Architecture sections, not
  their implementations — it can start as soon as those two phase files are written.
- Phase 6 needs 3, 4, 5 on disk.

**File ownership (no two parallel phases share a file):**
| Phase | Owns |
|---|---|
| 1 | `apps/api/prisma/**` |
| 2 | `apps/api/src/budget/budget-math.service.ts` + `.spec.ts` |
| 3 | rest of `apps/api/src/budget/**`, `apps/api/src/app.module.ts` |
| 4 | `apps/api/src/savings-entries/**` |
| 5 | `apps/web/src/**` |
| 6 | `apps/api/test/**`, `docs/**` |

## Decisions already made (don't re-litigate)
- **A separate `BudgetSettings` table, not columns on `User`.** `User` is the identity row with a
  deliberately narrow `PROFILE_SELECT` projection; five money columns would either bloat every auth
  response or need a second projection anyway. Every other per-user domain concern in this schema
  (`Goal`, `RateAlert`) is already its own userId-scoped table. Absence of a row is a clean
  "not configured yet", where five nullable columns leave ambiguous half-set states.
  See [phase-01](phase-01-prisma-budget-settings.md). **Open question — user sign-off wanted.**
- **Exactly three expense fields** (`rent`, `food`, `other`), each a plain running total. Naming
  them is honest about the scope; a generic `expenses: Json[]` would be the first step toward the
  budgeting app we explicitly are not building.
- **`GET /budget/available` is its own endpoint, not folded into `/dashboard`.** Folding it in would
  make `GoalsModule` depend on `BudgetModule` which depends on `GoalsService` — a module cycle. The
  cost is one extra request and one repeated goals+sums query per dashboard load; for a personal app
  with a handful of goals that is cheap, and TanStack Query fires it in parallel. Escape hatch if it
  ever matters is in [phase-03](phase-03-backend-budget-endpoints.md) Risk Assessment.
- **The split is atomic.** `prisma.$transaction([...])` over pre-validated, pre-frozen rows — not a
  naive loop over `create()`, which would give N goal lookups, N rate fetches, and a half-written
  ledger on failure with no UI to find or undo it. One rate is fetched for the whole split, so every
  entry in one split shares one `fxRateUsed`.
- **Allocation priority is nearest-deadline-first**, tie-broken by smaller remaining need, then by
  goalId for determinism. Greedy fill down the list; the goal that exhausts the pool gets a partial
  amount and the rest get zero. No fair-share/proportional mode (YAGNI).
- **All allocation arithmetic is integer in the budget currency.** Convert, round to 0dp ROUND_UP
  for a need, ROUND_DOWN for the pool, so the suggested split can never exceed what the user has.
- **No new env vars, no new secrets.** Nothing changes in Render/Vercel config.

## Testing posture
The pure `BudgetMathService` is where the real bugs live and it is the cheapest thing in the repo to
prove correct — same posture as `goal-math.service.spec.ts` (hand-rolled inputs, `today` and `rate`
passed in explicitly, no mocking framework). Cross-currency summing, null `suggestedMonthlyAmount`,
allocation ordering and rounding are all unit-level. E2E (`apps/api/test/`, real Postgres, real
`ValidationPipe` and guards) covers the four new endpoints and proves per-user isolation the way
`data-isolation.e2e-spec.ts` already does: cross-user access returns **404, never 403**.

## Success criteria
A user sets income 400,000 JPY with 150,000 of fixed expenses, has three goals with deadlines (one
in VND), and the dashboard shows a single available-balance figure in JPY with a per-goal breakdown
that adds up to exactly the number shown — including the VND goal converted at the live rate, and
including a visible "not counted" list for the deadline-less goal. When the goals ask for more than
is available, a suggested split appears; pressing *Apply* lands on the split screen pre-filled, and
submitting creates one `SavingsEntry` per goal with each goal's own frozen `amountInGoalCurrency`.
Zero English prose in any new error response; every new string exists in both `vi.json` and `ja.json`.

## Next steps after delivery
Changelog entry, `docs/data-model.md` gains the `BudgetSettings` row, `docs/system-architecture.md`
gains the budget module, roadmap item ticked. Explicitly *not* now: expense history over time,
multi-month projections, a "what if I move this deadline" simulator.
