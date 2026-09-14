# Phase 1 — Prisma: `BudgetSettings` table

## Context Links
- [plan.md](plan.md) · [phase-03 (first consumer)](phase-03-backend-budget-endpoints.md)
- `apps/api/prisma/schema.prisma` — header comment: *"Additive migrations only from here on"*
- Precedent: `apps/api/prisma/migrations/20260913132252_google_identity` (nullable column, no data loss)
- `docs/data-model.md` — rollback boundary

## Overview
- **Priority:** P2 · **Status:** pending · **Effort:** 0.5h
- One new table holding a user's monthly income, three fixed-expense totals, and the currency they
  are all declared in. Nothing else in the schema changes.

## Key Insights
- **`User` is the identity row.** `UsersService` projects it through an explicit `PROFILE_SELECT`
  specifically so `passwordHash` cannot leak by construction. Adding five money columns forces a
  choice between widening that projection (budget data in every auth response) or maintaining a
  second projection — at which point the separate table is simpler.
- **Absence of a row is a meaningful state.** "Hasn't set a budget yet" is one condition, not five
  independently-null columns whose combinations are undefined.
- **Every other per-user domain concern already has its own table** — `Goal`, `RateAlert`,
  `SavingsEntry`. This follows the grain of the schema instead of cutting across it.
- Money columns in this schema are `Decimal(18,2)`; that scale is what
  `DecimalSerializerInterceptor` assumes for any field not in its rate allowlist. Use it, and do
  **not** name any new field `rate`/`threshold`-like.

## Requirements
**Functional**
- Store per user: `monthlyIncome`, `expenseRent`, `expenseFood`, `expenseOther`, `currency`.
- Exactly one settings row per user; deleting a user deletes it.

**Non-functional**
- Additive only: new table, no column drops, no type narrowing, no backfill. Every existing row and
  query is untouched.
- `prisma migrate deploy` already runs in Render's build command — no deployment wiring needed.

## Architecture
```prisma
model BudgetSettings {
  id            String   @id @default(uuid())
  userId        String   @unique
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  monthlyIncome Decimal  @db.Decimal(18, 2)
  expenseRent   Decimal  @default(0) @db.Decimal(18, 2)
  expenseFood   Decimal  @default(0) @db.Decimal(18, 2)
  expenseOther  Decimal  @default(0) @db.Decimal(18, 2)
  currency      Currency
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
```
Plus `budgetSettings BudgetSettings?` on `model User`.

- `userId @unique` gives the one-to-one at the database level, so a duplicate row is impossible even
  if service logic is wrong. It also makes `findUnique({ where: { userId } })` and
  `upsert({ where: { userId } })` legal — which is the whole read/write surface Phase 3 needs.
- `@unique` implies an index; no separate `@@index([userId])` (unlike `Goal`, which is non-unique).
- Expenses default to `0` so a user can declare income alone; income has no default because
  declaring it is the entire point of the row existing.
- Reuses the existing `Currency` enum — no new enum, no third currency (see Risk).

## Related Code Files
**Modify:** `apps/api/prisma/schema.prisma`
**Create:** `apps/api/prisma/migrations/<timestamp>_budget_settings/migration.sql` (generated)
**Delete:** none

## Implementation Steps
1. Append the `BudgetSettings` model to `schema.prisma`, after `Goal` (domain grouping, not at the end).
2. Add `budgetSettings BudgetSettings?` to the relation list on `model User`.
3. `pnpm --filter @okane/api db:migrate --name budget_settings`.
4. Read the generated `migration.sql`: confirm it is a single `CREATE TABLE` + `CREATE UNIQUE INDEX`
   + `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY`. Any `DROP` or `ALTER COLUMN` on an existing
   table means something went wrong — stop.
5. `pnpm --filter @okane/api build` to confirm the regenerated client type-checks.

## Todo List
- [ ] `BudgetSettings` model added
- [ ] `User.budgetSettings` back-relation added
- [ ] Migration generated and its SQL read, not assumed
- [ ] SQL contains no `DROP`/`ALTER COLUMN` against an existing table
- [ ] API builds against the regenerated client

## Success Criteria
`pnpm --filter @okane/api build` passes; `pnpm --filter @okane/api test:e2e` still passes untouched
(proving nothing existing regressed); a manual `prisma studio` shows an empty `BudgetSettings` table.

## Risk Assessment
| Risk | Likelihood | Impact | Countermove |
|---|---|---|---|
| Migration diverges between local dev and Supabase | Low | High | Additive-only table; `migrate deploy` on Render applies the same committed SQL. Verified in [phase-06](phase-06-tests-docs-rollout.md). |
| Two-currency assumption baked in | Medium | Low | `convertAmount` is already JPY↔VND-only across the whole codebase. A third currency is a separate, larger change; nothing here makes it worse. |
| Expense fields grow into a category system | Medium | Medium | Three named columns, not a JSON array. Adding a fourth is a deliberate migration, which is the friction we want. |

## Security Considerations
- `onDelete: Cascade` — deleting a user removes their financial declarations, matching `Goal` and
  `RateAlert`. No orphan financial data.
- `userId @unique` is a data-integrity control, not an access control: Phase 3 still scopes every
  query by `userId`.

## Rollback
Revert the schema edit and delete the migration directory; on a deployed database, a single
`DROP TABLE "BudgetSettings"` is sufficient and touches nothing else. No other table changed, so
rollback cannot cascade.

## Next Steps
Unblocks [phase-03](phase-03-backend-budget-endpoints.md). Does not block
[phase-02](phase-02-budget-math-module.md) or [phase-04](phase-04-backend-multi-goal-split.md).
