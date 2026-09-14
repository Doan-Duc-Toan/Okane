# Phase 6 — E2E tests, docs, production migration verification

## Context Links
- [plan.md](plan.md) · needs 3, 4, 5 on disk
- House e2e style: `apps/api/test/data-isolation.e2e-spec.ts` (two seeded users, 404 not 403),
  `apps/api/test/auth-google.e2e-spec.ts` (provider override for determinism)
- `apps/api/package.json` → `test:e2e` = `NODE_ENV=test vitest run --config ./vitest.config.e2e.ts`
- `docs/data-model.md`, `docs/system-architecture.md`, `docs/project-changelog.md`,
  `docs/development-roadmap.md`, `docs/deployment.md`

## Overview
- **Priority:** P2 · **Status:** pending · **Effort:** 1.5h
- Prove the four new endpoints over real HTTP against real Postgres with the real guards and
  `ValidationPipe`, prove per-user isolation, then update docs and verify the migration in production.

## Key Insights
- **Unit tests already cover the arithmetic** ([phase-02](phase-02-budget-math-module.md), 18 cases).
  E2E must not re-test the math — it tests wiring: routing, guards, validation, serialization scale,
  transaction atomicity, isolation. Duplicating the math here would be slow and would rot.
- **The rate is the one nondeterministic input.** `RATE_PROVIDER` is a DI token; override it with a
  fixed-rate fake in the test module exactly as `auth-google.e2e-spec.ts` overrides the verifier.
  Two suites' worth of behaviour (rate present, rate null) become deterministic and network-free.
- **Atomicity is only provable by counting rows.** Assert `savingsEntry.count` before and after a
  rejected split — a 404 with 2 of 3 entries written would pass a status-code-only assertion.
- **Money scale is a contract, not a detail.** Assert the literal `"400000.00"` string, not
  `Number(body.monthlyIncome) === 400000` — the latter passes even when the serializer regresses.

## Requirements
**Functional**
- E2E coverage for `GET /budget`, `PUT /budget`, `GET /budget/available`, `POST /entries/split`.
- Cross-user isolation proven for all four.
- Docs reflect the new table, module, and endpoints.
- Migration verified applied on Supabase after deploy.

**Non-functional**
- Suites self-clean (`prisma.user.deleteMany` on the seeded emails in `afterAll`) and use
  timestamped emails, matching existing specs.
- Green `test`, `test:e2e`, `lint`, `build` in both workspaces before push.

## Architecture

**New files:**
- `apps/api/test/budget.e2e-spec.ts`
- `apps/api/test/entries-split.e2e-spec.ts`

**Modify:** `apps/api/test/data-isolation.e2e-spec.ts` — extend with the new surfaces, rather than
starting a third isolation suite (the existing one is already the named home for this contract).

**Test matrix — `budget.e2e-spec.ts`:**
| # | Case | Expect |
|---|---|---|
| 1 | `GET /budget` on a fresh user | `200 { configured: false, settings: null }` |
| 2 | `PUT /budget` valid | `200`, money as fixed-scale strings (`"400000.00"`) |
| 3 | `PUT /budget` twice | upserts — still exactly one row for that user |
| 4 | `PUT` negative income | `400 budgetIncomeInvalid` |
| 5 | `PUT` bad currency | `400 budgetCurrencyInvalid` |
| 6 | `PUT` with an extra body field | `400 unexpectedField` (global `forbidNonWhitelisted`) |
| 7 | `GET /budget/available` unconfigured | `200 { configured: false }` |
| 8 | Configured, one on-track goal, same currency | `available = income − expenses − need`, arithmetic reconciles |
| 9 | Goal with no deadline | appears in `excluded` with `reason: "no_deadline"`, contributes 0 |
| 10 | Cross-currency goal, fake rate present | `counted[].needInBudgetCurrency` converted, `rateUsed` non-null |
| 11 | Cross-currency goal, fake rate `null` | `200` with `rateUnavailable: true` — **not** 503 |
| 12 | Overrun (needs > income − expenses) | `shortfall > 0`, `allocation` non-null, Σ amounts = pool |
| 13 | No token | `401` on all three routes |

**Test matrix — `entries-split.e2e-spec.ts`:**
| # | Case | Expect |
|---|---|---|
| 1 | Split across 2 same-currency goals | `201`, 2 entries, both `fxRateUsed: null` |
| 2 | Split including a cross-currency goal | that entry's `amountInGoalCurrency` converted, `fxRateUsed` non-null |
| 3 | All entries in one split share one `fxRateUsed` | equal values |
| 4 | Each goal's dashboard `savedAmount` after the split | moved by exactly its allocation |
| 5 | Empty `allocations` | `400 splitAllocationsEmpty` |
| 6 | Duplicate goalId | `400 splitDuplicateGoal` |
| 7 | 21 allocations | `400 splitAllocationsTooMany` |
| 8 | Future `entryDate` | `400 entryDateFuture` |
| 9 | Non-positive amount | `400 splitAmountInvalid` |
| 10 | **One foreign goalId among valid ones** | `404 goalNotFound` **and entry count unchanged** |
| 11 | Cross-currency with rate `null` | `503 rateUnavailable`, zero entries written |

**Isolation additions (`data-isolation.e2e-spec.ts`):**
- B's `GET /budget` never returns A's settings (B sees `configured:false` while A is configured).
- B's `PUT /budget` creates B's own row; A's row is unchanged.
- B's `GET /budget/available` counts only B's goals.
- B splitting into A's goal → `404`, zero rows.

## Implementation Steps
1. Write `budget.e2e-spec.ts`: bootstrap the app exactly as the existing specs do
   (`app.setGlobalPrefix('api')` + the same `ValidationPipe` options — omitting either makes the
   suite test a different application than production runs), with `RATE_PROVIDER` overridden by a
   fixed-rate fake. Two describes: rate-present and rate-null.
2. Write `entries-split.e2e-spec.ts`, same bootstrap. For case 10 and 11, snapshot
   `prisma.savingsEntry.count({ where: { userId } })` around the failing request.
3. Extend `data-isolation.e2e-spec.ts` with the four cases above.
4. Run `pnpm --filter @okane/api test:e2e`. **Do not** relax an assertion to get green — a failure
   here is a real finding.
5. Docs:
   - `docs/data-model.md` — `BudgetSettings` row, the one-per-user constraint, and the note that
     allocation suggestions are **computed, never stored**.
   - `docs/system-architecture.md` — the budget module, its one-way dependency on `GoalsModule`, and
     the read-degrades / write-throws split on a missing rate.
   - `docs/project-changelog.md` — feature entry.
   - `docs/development-roadmap.md` — tick the item.
   - `docs/deployment.md` — only if anything changed; expected: **no change, no new env vars**.
6. Commit per conventional commits, no AI references (repo convention).
7. After deploy: confirm Render's build ran `prisma migrate deploy`, then verify in Supabase that
   `BudgetSettings` exists and `_prisma_migrations` has the new row. Smoke `GET /api/budget` with a
   real production token → `{ configured: false }`.

## Todo List
- [ ] `budget.e2e-spec.ts` — 13 cases
- [ ] `entries-split.e2e-spec.ts` — 11 cases
- [ ] `data-isolation.e2e-spec.ts` extended — 4 cases
- [ ] Row-count assertions around both rejected-split cases
- [ ] Fixed-scale money strings asserted literally
- [ ] `test`, `test:e2e`, `lint`, `build` green in both workspaces
- [ ] 4 docs updated; `deployment.md` confirmed unchanged
- [ ] Migration verified on Supabase; production smoke passes

## Success Criteria
All suites green with no assertion weakened to get there. Every new endpoint returns 404 (never 403,
never 200) for cross-user access. A rejected split leaves the entry count exactly where it was.
Production `GET /api/budget` answers `{ configured: false }` for a user who has not set one.

## Risk Assessment
| Risk | Likelihood | Impact | Countermove |
|---|---|---|---|
| E2E flakes on the live rate | High if unhandled | Medium | `RATE_PROVIDER` overridden with a fixed fake — no network in any suite |
| Suites leak rows between runs | Medium | Low | Timestamped emails + `deleteMany` in `afterAll`, as existing specs do |
| Bootstrap drifts from production config | Medium | High | Copy the pipe/prefix setup from an existing spec verbatim; `AppModule` already applies the global interceptor |
| Migration not applied on Render | Low | High | `prisma migrate deploy` is already in the build command; step 7 verifies rather than assumes |
| Docs drift from behaviour | Medium | Low | Docs updated in the same commit range as the code |

## Security Considerations
- Isolation assertions are the security tests for this feature; they must be present before merge.
- Test users use throwaway timestamped emails and are deleted after each run.
- No production credentials in specs — e2e uses the `NODE_ENV=test` database config already wired.
- Production smoke uses a real token; do not paste it into any committed file or log.

## Rollback
Test and doc files are additive. If the feature itself is reverted, delete the two new specs and the
isolation additions; nothing else depends on them.

## Next Steps
Feature complete. Follow-ups explicitly deferred: expense history over time, multi-month projection,
a deadline-what-if simulator.
