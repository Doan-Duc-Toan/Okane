# Data Model & Isolation Rules

This document restates the schema and the per-user data-isolation contract from
plan `260910-1521-okane-react-nestjs-mvp` Phase 2, so the rule survives outside
the plan directory. Every service touching a user-owned table must follow it.

## Schema summary

- `User` — email/password **or Google** account. `passwordHash` only, never a plaintext column;
  it is `null` for a Google-only account (`googleId` set instead, storing Google's stable `sub`).
  A user may have both.
- `RefreshToken` — hashed, revocable JWT refresh sessions.
- `Goal` — a savings target in one currency (`JPY` or `VND`). Currency is
  immutable after creation (see rationale below).
- `SavingsEntry` — a logged contribution. May be entered in either currency;
  the conversion into the goal's currency is **frozen at logging time**
  (`amountInGoalCurrency` + `fxRateUsed`), never recomputed against today's rate.
- `RateSnapshot` — one row per `(base, quote, capturedOn)` per day, enforced by
  a DB unique constraint. `capturedOn` is stored as a **UTC date** — this is the
  project-wide convention; do not reinterpret it in local time anywhere.
- `RateAlert` — user-scoped threshold alert, evaluated once daily against the
  snapshot cron. Crossing-only semantics (see Phase 5).

Money fields are `Decimal(18,2)` (amounts) or `Decimal(20,8)` (FX rates), never
`Float`. Prisma's `Decimal` does not survive `JSON.stringify` as a number — it
is serialized to a **string** on every HTTP response by a global interceptor
(`DecimalSerializerInterceptor`). Clients must never cast a money field through
`Number()`; format with `Intl.NumberFormat` instead.

## Why a goal's currency is immutable

Changing a goal's currency after entries exist would invalidate every frozen
`amountInGoalCurrency` already stored against it. The documented correction
path is delete-and-recreate, not an edit — this removes an entire class of
silent corruption for a negligible UX cost.

## Data-isolation pattern (mandatory, every user-owned model)

Prisma has no row-level security and no global scopes — isolation is a
service-layer discipline enforced by query *shape*, not by convention alone.

| Operation | Required shape | Why |
|---|---|---|
| list | `findMany({ where: { userId, ...filters } })` | never an unscoped `findMany` |
| read one | `findFirst({ where: { id, userId } })` | **not** `findUnique({ where: { id } })` — that ignores ownership |
| update | `updateMany({ where: { id, userId }, data })` → `count === 0` ⇒ `NotFoundException` | ownership check and write in one atomic query; no fetch-then-check race |
| delete | `deleteMany({ where: { id, userId } })` → same count check | same |
| nested create | verify parent first: `goal.findFirst({ where: { id: goalId, userId } })` | stops writing a child under someone else's parent |

**Always throw 404, never 403, on a foreign-owned resource** — a 403 confirms
the row exists and leaks the ID space to an attacker probing IDs.

This is proven, not just documented: `apps/api/test/data-isolation.e2e-spec.ts`
(Phase 4) and `apps/api/test/rate-alerts-isolation.e2e-spec.ts` (Phase 5) seed
two users and assert every cross-user access on every user-owned endpoint
returns 404.

If a leak is ever found in production, the escalation path is a Prisma
`$extends` query guard that throws on an unscoped query against a scoped
model — deliberately deferred for MVP (a test that fails loudly beats a
runtime abstraction nobody reads), but recorded here as the next step.

## Rollback boundary

`prisma migrate reset --force` is a legitimate rollback tool **only** while no
production data exists (pre-launch). Once real user data exists, resets must
stop being used casually — this line is the boundary.
