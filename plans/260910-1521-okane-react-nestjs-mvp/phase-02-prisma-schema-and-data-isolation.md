# Phase 2: Prisma Schema & Data-Isolation Foundation

## Context Links
- Plan overview: [plan.md](plan.md)
- Depends on: [phase-01-monorepo-scaffold-and-dev-environment.md](phase-01-monorepo-scaffold-and-dev-environment.md)
- Prior-art note: the cancelled Laravel plan relied on an Eloquent global scope; Prisma has no
  equivalent, so the safeguard is re-derived from scratch here.

## Overview
- **Priority:** Blocking — Phases 3, 4, 5 all read this schema.
- **Status:** done — see deviations note below
- **Effort:** 3h
- Define the **complete MVP schema in one migration**, wire `PrismaModule`, and establish the
  per-user data-isolation pattern that every later service must follow.

## Key Insights
- **The whole schema lands here, not incrementally per feature phase.** This is deliberate: it is
  the only way Phases 4 and 5 can run in parallel without both editing `schema.prisma`. One file,
  one owner, one migration.
- **Prisma has no row-level security and no global scopes.** Isolation is a service-layer
  discipline, and discipline that isn't tested is a wish. The enforcement mechanism is
  (a) a mandatory query shape, (b) a dedicated isolation e2e suite in Phase 4/5.
- **Both JPY and VND are zero-decimal currencies** — no yen or dong is ever split in practice.
  But cross-currency conversion *produces* fractions, so amounts are stored as
  `Decimal(18,2)` and only rounded at display time. Never `Float`: binary floats cannot represent
  money, and a savings app that loses ¥1 to rounding loses user trust.
- **Prisma `Decimal` does not survive `JSON.stringify` as a number.** Serialize money as **strings**
  over the wire and format on the client with `Intl.NumberFormat`. Decided once, here, so every
  later phase inherits it.
- **A savings entry's converted value must be frozen at logging time.** If progress were recomputed
  from today's rate, yesterday's 90% could silently become 87% overnight. That is a correctness
  bug, not a display quirk — hence `amountInGoalCurrency` + `fxRateUsed` as stored columns.

## Requirements
**Functional**
- Models: `User`, `RefreshToken`, `Goal`, `SavingsEntry`, `RateSnapshot`, `RateAlert`.
- Every user-owned row carries `userId` with a cascading delete from `User`.
- One `RateSnapshot` per calendar day per currency pair (uniqueness enforced by the DB, not by code).
- Seed script produces a demo user with two goals, a spread of entries, and ~90 days of
  back-dated snapshots so the chart is developable before the cron has run for three months.

**Non-functional**
- Migration runs clean on an empty DB and is idempotent to re-apply via `migrate reset`.
- Indexes on every foreign key used for listing (`Goal.userId`, `SavingsEntry.goalId`).

## Architecture

**Schema (Prisma, `apps/api/prisma/schema.prisma`)**
```
enum Currency        { JPY VND }
enum AlertDirection  { ABOVE BELOW }
enum Locale          { vi ja }
enum ThemePref       { light dark system }

User          id uuid pk · email unique citext-ish(lowercased) · passwordHash
              displayName? · locale Locale @default(vi) · theme ThemePref @default(system)
              createdAt updatedAt
RefreshToken  id · userId→User(cascade) · tokenHash unique · expiresAt · revokedAt?
              createdAt · @@index([userId])
Goal          id · userId→User(cascade) · name · targetAmount Decimal(18,2)
              currency Currency · deadline DateTime? @db.Date · createdAt updatedAt
              @@index([userId])
SavingsEntry  id · userId→User(cascade) · goalId→Goal(cascade)
              amount Decimal(18,2) · currency Currency           ← as entered
              amountInGoalCurrency Decimal(18,2)                 ← frozen at log time
              fxRateUsed Decimal(20,8)?                          ← null when same currency
              entryDate DateTime @db.Date · note String?
              createdAt updatedAt · @@index([goalId]) @@index([userId])
RateSnapshot  id · base Currency · quote Currency · rate Decimal(20,8)
              capturedOn DateTime @db.Date · source String · createdAt
              @@unique([base, quote, capturedOn]) @@index([capturedOn])
RateAlert     id · userId→User(cascade) · direction AlertDirection
              threshold Decimal(20,8) · active Boolean @default(true)
              lastTriggeredAt DateTime? · lastTriggeredRate Decimal(20,8)?
              createdAt updatedAt · @@index([userId])
```
`RateAlert` has no pair columns — MVP is JPY→VND only. Adding a pair later is an additive
migration with a default; carrying unused columns now would be YAGNI.

**Data-isolation pattern (mandatory, every user-owned model)**
| Operation | Required shape | Why |
|---|---|---|
| list | `findMany({ where: { userId, ...filters } })` | never an unscoped `findMany` |
| read one | `findFirst({ where: { id, userId } })` | **not** `findUnique({ where: { id } })` — that ignores ownership |
| update | `updateMany({ where: { id, userId }, data })` → `count === 0` ⇒ `NotFoundException` | ownership check and write in one atomic query; no fetch-then-check race |
| delete | `deleteMany({ where: { id, userId } })` → same count check | same |
| nested create | verify parent first: `goal.findFirst({ where: { id: goalId, userId } })` | stops writing a child under someone else's parent |

Always throw **404, never 403**, on a foreign-owned resource — a 403 confirms the row exists and
leaks the ID space.

**Data flow**
```
HTTP req → JwtAuthGuard (Phase 3) → @CurrentUser() userId → Service (adds userId to every where)
        → PrismaService → Postgres
```

## Related Code Files
**Create:**
- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/seed.ts`
- `apps/api/src/prisma/prisma.module.ts`, `apps/api/src/prisma/prisma.service.ts`
- `apps/api/src/common/prisma-error.filter.ts` (maps P2002 unique-violation → 409, P2025 → 404)
- `apps/api/src/common/decimal.serializer.ts` (Decimal → string in responses)
- `docs/data-model.md` (schema + isolation rule, so the rule outlives this plan)

**Modify:**
- `apps/api/src/app.module.ts` — import `PrismaModule`
- `apps/api/package.json` — `prisma.seed` hook, `db:migrate`, `db:seed`, `db:studio` scripts
- `apps/api/.env.example` / `.env` — `DATABASE_URL`

## Implementation Steps
1. `pnpm --filter api add @prisma/client` and `-D prisma tsx`; `pnpm --filter api exec prisma init --datasource-provider postgresql`.
2. Write the full schema above. Set `previewFeatures` only if actually needed (default: none).
3. `prisma migrate dev --name init_okane_schema` against the running Docker Postgres.
4. `PrismaService extends PrismaClient implements OnModuleInit` → `await this.$connect()`.
   Export a global `PrismaModule`. Do **not** add `enableShutdownHooks` on the client (removed in
   Prisma 5+); use `app.enableShutdownHooks()` in `main.ts` instead.
5. Decimal serialization: register a global interceptor (or `Decimal.prototype.toJSON = function(){ return this.toString() }`
   set once at bootstrap). Prefer the explicit interceptor — a prototype patch is invisible action at a distance.
6. `PrismaClientExceptionFilter`: P2002 → 409 with the conflicting field, P2025 → 404. Register globally.
7. Write `seed.ts`: demo user (`demo@okane.local` / `Password123!`, bcrypt-hashed), 2 goals
   (one JPY target, one VND target with a deadline ~10 months out), ~15 entries across both
   currencies with plausible frozen rates, and 90 days of `RateSnapshot` rows walking ±1.5%
   random around 168.4 (the rate verified live on 2026-09-10). Make the seed idempotent via `upsert`.
8. Add `docs/data-model.md` restating the isolation table verbatim — later contributors (and agents)
   must be able to find the rule without reading this plan.
9. Verify: `pnpm db:reset` (migrate reset + seed) completes; `prisma studio` shows the seeded rows;
   `prisma migrate status` reports no drift.

## Todo List
- [x] Prisma + client installed; schema written by hand (see deviation below); `DATABASE_URL` wired
- [x] Full 6-model schema written with enums, indexes, and the `(base,quote,capturedOn)` unique
- [x] `init_okane_schema` migration applied cleanly to an empty DB (and to `okane_test`)
- [x] `PrismaService` + global `PrismaModule`; shutdown hooks in `main.ts`
- [x] Decimal→string response interceptor registered and verified on a real response body
- [x] Prisma exception filter mapping P2002/P2025
- [x] Idempotent seed: demo user, 2 goals, mixed-currency entries, 90 days of snapshots
- [x] `docs/data-model.md` documents the isolation query-shape table
- [x] Migration applied cleanly to both `okane` and `okane_test`; `migrate status` reports no drift

## Deviations from the blueprint
- **Prisma pinned to 6.19.3, not "latest" (8.0.0-rc.13).** `pnpm add prisma` resolved to an
  8.0.0-rc.13 pre-release CLI with a fundamentally different command surface (`prisma migration`
  instead of `prisma migrate`, no `datasource.url` in schema, requires a driver-adapter-based
  `prisma.config.ts`). This is exactly the risk flagged in this phase's own Risk Assessment
  ("Version pins unverified... if a major breaks, pin down one major and note it") — resolved by
  pinning `prisma`/`@prisma/client` to `6.19.3` (latest stable major), which supports the classic
  `datasource { url = env(...) }` schema and `prisma migrate dev/reset/studio` commands the rest of
  this plan assumes. `prisma.seed` is declared via `package.json#prisma` (deprecated-but-working in
  6.x with a warning; would need `prisma.config.ts` if upgrading to 7+ later).
- **Decimal serializer uses `toFixed(n)` with a field-name allowlist, not plain `toString()`.**
  decimal.js (which Prisma's `Decimal` wraps) strips trailing zeros on `toString()` —
  `new Decimal("1500000.00").toString()` returns `"1500000"`, which fails this phase's own success
  criterion verbatim. Fixed by calling `.toFixed(2)` for money fields and `.toFixed(8)` for a
  small allowlist of rate-carrying field names (`rate`, `fxRateUsed`, `rateUsed`, `threshold`,
  `lastTriggeredRate`) in `decimal.serializer.interceptor.ts`. Any new rate-scale field added in
  Phase 5 must be added to that allowlist or it will silently truncate to 2dp.
- File named `decimal.serializer.interceptor.ts` (not `decimal.serializer.ts`) — it register as a
  Nest interceptor, and the project's file-naming convention favors self-describing names.

## Success Criteria
- `prisma migrate reset --force` on an empty database completes and seeds without error.
- A response containing a money field serializes as `"targetAmount": "1500000.00"` (string),
  verified against an actual HTTP response, not by inspection of the code.
- Inserting a second `RateSnapshot` for the same `(JPY, VND, date)` is rejected **by the database**.
- Deleting a `User` cascades away their goals, entries, alerts, and refresh tokens (verified in `studio` or a script).

## Risk Assessment
| Risk | Likelihood | Impact | Countermove |
|---|---|---|---|
| A future service forgets `userId` in a `where` → cross-user leak | **High** | **Critical** | The mandatory query-shape table above + the dedicated isolation e2e suite in Phases 4/5 + `docs/data-model.md`. If a leak is ever found, escalate to a Prisma `$extends` query guard that throws on an unscoped query against a scoped model (deliberately deferred — a test that fails loudly beats a runtime abstraction nobody reads) |
| `findUnique({ id })` used out of habit for a read-one | High | Critical | Same as above; call it out in code review as the single most likely isolation bug |
| Decimal precision lost by an accidental `Number()` cast in a service | Medium | High | Keep money arithmetic inside `Decimal`; unit-test the goal math in Phase 4 with values that break float (e.g. 0.1+0.2) |
| Schema needs a change during Phase 4/5 despite being frozen here | Medium | Low | Additive migration only, and it becomes that phase's file (never a rewrite of `init`); if 4 and 5 both need one, serialize them |
| Seed rate walk produces unrealistic chart data | Low | Low | Bound the random walk to ±1.5%/day around 168.4 |

**Rollback:** `prisma migrate reset --force` wipes and re-applies. No production data exists
pre-launch, so reset is a legitimate rollback tool *now* and must stop being one at launch —
record that boundary in `docs/data-model.md`.

## Security Considerations
- `passwordHash` only; a plaintext password column must never exist, not even transiently.
- Emails stored lowercased at write time so `A@x.com` cannot register a second account alongside `a@x.com`.
- Refresh tokens stored **hashed** (`tokenHash`), so a DB read cannot be replayed as a session.
- Cascade deletes give a user-deletion path that leaves no orphaned financial rows (APPI-relevant).
- The seed's demo credentials are dev-only — the seed script must refuse to run when `NODE_ENV=production`.

## Next Steps
→ Phase 3 (auth) consumes `User` + `RefreshToken`.
→ Phases 4 and 5 consume the rest and must not modify this schema.
