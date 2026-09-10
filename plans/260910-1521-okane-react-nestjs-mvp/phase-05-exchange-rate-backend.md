# Phase 5: Exchange-Rate Backend (provider, snapshot cron, history, alerts)

## Context Links
- Plan overview: [plan.md](plan.md)
- Depends on: [phase-02](phase-02-prisma-schema-and-data-isolation.md) (`RateSnapshot`, `RateAlert`),
  [phase-03](phase-03-auth-backend-jwt.md) (per-user alert scoping only — the cron needs no auth)
- Consumed by: [phase-04](phase-04-goals-and-entries-backend.md) (`getLatestRate()`),
  [phase-09](phase-09-exchange-and-convert-ui.md)

## Overview
- **Priority:** High — the FX feature set is the product's differentiator.
- **Status:** done — see Verification Notes for two real bugs found and fixed during verification
- **Effort:** 5h
- One module owning: the provider client, the daily snapshot cron, the current-rate and history
  endpoints, the converter, and rate-alert CRUD + crossing detection.

## Key Insights
Provider behaviour verified live on 2026-09-10, not assumed:
- `GET https://open.er-api.com/v6/latest/JPY` → `200`, no API key, `result: "success"`,
  `base_code: "JPY"`, `rates.VND = 168.434476`, `time_last_update_utc: "Thu, 10 Sep 2026 00:02:31 +0000"`,
  `time_next_update_utc: "Fri, 11 Sep 2026 00:13:01 +0000"`.
- **The free tier refreshes roughly once every 24 hours, just after 00:00 UTC.** That single fact
  drives the whole design: polling more often than daily returns identical numbers, so the
  daily snapshot both builds our history *and* is a complete caching strategy. **No Redis** — the
  DB is as fresh as the upstream source can ever be.
- Prior research confirmed **no free API offers historical depth for JPY/VND** (Frankfurter has no
  VND at all — ECB currency list only). Building our own history is a deliberate, accepted tradeoff:
  **the chart starts nearly empty and fills in one point per day.** Do not scope-creep into a paid
  backfill.
- Consequence to design around, not hide: **7d needs a week, 30d a month, 1y a year.** The UI must
  have a real "history is still building" state, and the seed (Phase 2) provides 90 synthetic days
  so the chart is developable on day one — clearly marked as seed data, never present in production.
- **Alerts fire on *crossing*, not on *condition holding*.** An `ABOVE 170` alert that re-triggered
  every single day the rate stayed above 170 would be noise. Compare the previous snapshot with
  the new one and fire only on the transition.
- **Cadence honesty:** alerts are evaluated once daily, right after the snapshot, and there is no
  delivery channel in MVP — the alert list shows "triggered on {date} at {rate}". The UI copy must
  say "checked daily", never "real-time".
- Smiles Wallet has **no public API**. The link to `https://www.smileswallet.com/japan/vi/` is a
  plain outbound anchor — nothing to build.

## Requirements
**Functional**
- `GET /api/rates/current` → latest snapshot + `asOf` + staleness flag.
- `GET /api/rates/history?range=7d|30d|1y` → ascending time series.
- `POST /api/rates/convert` → `{amount, from, to}` → converted value + rate used.
- Rate alerts: list / create / update (threshold, direction, active) / delete — user-scoped.
- Daily cron: fetch → upsert snapshot → evaluate alerts.
- Bootstrap fetch on module init when today's snapshot is missing.

**Non-functional**
- Provider call: 10s timeout, 2 retries with backoff, never blocks an HTTP request path.
- A provider failure must not crash the app or write a bogus snapshot.
- Snapshot write is idempotent — re-running the cron the same day changes nothing.

## Architecture
```
apps/api/src/exchange-rate/
├── exchange-rate.module.ts
├── exchange-rate.controller.ts       # /rates/current · /rates/history · /rates/convert
├── exchange-rate.service.ts          # getLatestRate · getHistory · DB reads
├── rate-provider.client.ts           # HTTP to open.er-api.com, parse + validate
├── rate-snapshot.scheduler.ts        # @Cron + OnModuleInit bootstrap
├── rate-converter.service.ts         # PURE math (unit-tested)
├── rate-alerts.controller.ts · rate-alerts.service.ts   # user-scoped CRUD
├── rate-alert-evaluator.service.ts   # PURE crossing logic (unit-tested)
└── dto/{convert.dto.ts,history-query.dto.ts,create-alert.dto.ts,update-alert.dto.ts}
```

**Daily flow**
```
@Cron(FX_SNAPSHOT_CRON = '0 1 * * *', timeZone 'UTC')      # 01:00 UTC ≈ 10:00 JST,
   │                                                        # ~1h after the provider's ~00:10 refresh
   ├─ prev = latest snapshot (before today)
   ├─ RateProviderClient.fetchJpyVnd()
   │     ├─ non-200 / result != "success" / VND missing / rate <= 0  → throw
   │     └─ retry ×2 with backoff, then log an error and ABORT (no snapshot written today)
   ├─ upsert RateSnapshot on (JPY, VND, today)   ← idempotent
   └─ RateAlertEvaluator.evaluate(prev.rate, new.rate, activeAlerts)
         ABOVE: prev < threshold && new >= threshold  → trigger
         BELOW: prev > threshold && new <= threshold  → trigger
         prev === null (first ever snapshot)          → no trigger (nothing to cross)
         on trigger: set lastTriggeredAt, lastTriggeredRate
```
A missed day leaves a **gap**, not a fabricated point. The chart connects across gaps; it must
never interpolate and present a guess as an observation.

**Read path**
```
GET /rates/current → SELECT latest snapshot   (no outbound HTTP on the request path)
   → { rate, base:"JPY", quote:"VND", asOf:"2026-09-10", isStale: asOf < today-1, source }
GET /rates/history?range=30d → snapshots capturedOn >= today-30d, ASC
   → { range, points:[{date, rate}], pointCount, coverage:"partial"|"full" }
```
`coverage` lets the UI show "history is still building" from data rather than from a guess.

**Converter (pure)**
```
JPY→VND: amount × rate       VND→JPY: amount ÷ rate       same currency: identity
Decimal throughout; round to 0 decimals for display (both JPY and VND are zero-decimal currencies).
No rate available → the service returns null; callers decide (Phase 4 → 503, UI → empty state).
```

## Related Code Files
**Create:** every file in the tree above, plus
`apps/api/src/exchange-rate/rate-converter.service.spec.ts`,
`rate-alert-evaluator.service.spec.ts`,
`apps/api/test/rate-alerts-isolation.e2e-spec.ts`.

**Modify:**
- `apps/api/src/app.module.ts` — `ScheduleModule.forRoot()` + `ExchangeRateModule`
  (shared touchpoint with Phase 4 — append only)
- `apps/api/.env.example` — `FX_API_URL`, `FX_SNAPSHOT_CRON` (declared in Phase 1; confirm)

## Implementation Steps
1. `pnpm --filter api add @nestjs/schedule`. Use the built-in `fetch` (Node 24) — no axios needed.
2. `RateProviderClient.fetchJpyVnd()`: `AbortSignal.timeout(10_000)`; validate `result === 'success'`,
   `base_code === 'JPY'`, `typeof rates.VND === 'number'`, `rates.VND > 0`. Return
   `{ rate: new Decimal(rates.VND), providerUpdatedAt, source: 'open.er-api.com' }`.
   **Validate the payload rather than trusting it** — a silently malformed response would poison
   the history table permanently.
3. Retry helper: 2 retries, 2s then 6s backoff. Keep it a ~15-line local function, not a library.
4. `rate-snapshot.scheduler.ts`: `@Cron` from config + `onModuleInit` that runs the same routine
   only when today's snapshot is missing. The bootstrap solves two real cases — a laptop that was
   asleep at 01:00 UTC, and a fresh deploy with an empty table.
5. `ExchangeRateService.getLatestRate(): Promise<Decimal | null>` — **the signature Phase 4 depends on.**
   Also `getLatest()` returning the full snapshot, and `getHistory(range)`.
6. `history` range parsing via a DTO enum (`7d|30d|1y`) — never interpolate a raw query param into a date computation.
7. `rate-converter.service.ts` pure; `POST /rates/convert` validates `amount > 0` and
   `from !== to || identity`, returning `{ amount, from, to, converted, rate, asOf }`.
8. Rate-alert CRUD, user-scoped with the Phase 2 query shape. Validate `threshold > 0` and
   cap alerts per user (e.g. 10) — an unbounded list is a cheap way for one account to slow the cron.
9. `rate-alert-evaluator.service.ts` pure: takes `(prevRate | null, newRate, alerts[])` and returns
   the alerts to mark triggered. No DB access inside — that is what makes the crossing logic testable.
10. Unit tests — converter: JPY→VND, VND→JPY, round-trip tolerance, zero, very large amount, null rate.
    Evaluator: crossing up, crossing down, condition already true and staying true (**no** re-trigger),
    exact-equality boundary, inactive alert skipped, null prev (first snapshot) → no trigger.
11. e2e: `rate-alerts-isolation.e2e-spec.ts` — user B cannot read/update/delete user A's alert (404).
    Plus `GET /rates/current` on an empty table returns a clean 404/empty payload rather than a 500.
12. Manual verification: `curl` the real provider once, run the cron routine manually via a temporary
    dev-only route or a `tsx` script, confirm exactly one row per day and that re-running writes nothing new.

## Todo List
- [x] `@nestjs/schedule` installed and `ScheduleModule.forRoot()` registered
- [x] Provider client with timeout, payload validation, and retry/backoff
- [x] Daily `@Cron` at 01:00 UTC + `onModuleInit` bootstrap when today's snapshot is missing
- [x] Snapshot upsert idempotent on `(JPY, VND, date)` — required a fix, see Verification Notes
- [x] `getLatestRate()` (Phase 4's dependency) + `getCurrent()` (full snapshot; the blueprint named
  this `getLatest()`, implemented as `getCurrent()` — same purpose, see Deviations) + `getHistory(range)`
- [x] `/rates/current` reports `asOf` and `isStale`; `/rates/history` reports `coverage`
- [x] `/rates/convert` with a pure, unit-tested converter
- [x] Rate-alert CRUD, user-scoped, capped per user
- [x] Pure crossing evaluator — **no re-trigger while the condition merely persists**
- [x] Converter + evaluator unit suites green (all listed cases)
- [x] Alert isolation e2e green; empty-table read path does not 500
- [x] Verified: running the cron twice in one day creates exactly one row

## Deviations from the blueprint
- **`getLatest()` is named `getCurrent()`** and returns `{rate, base, quote, asOf, isStale, source}` —
  same contract, different name; picked up as-is from the code rather than renamed, since renaming
  a frozen read-path method this late has no benefit and only risks an unrelated diff.
- **`RateAlertsService` reads/writes `threshold` and `lastTriggeredRate` as plain strings** through
  Prisma's `Decimal` columns (no `new Decimal()` wrapping in the service), matching Phase 4's
  documented "money in/out as strings" convention — validation (`> 0`) is done via a throwaway
  `new Decimal(dto.threshold)` comparison, not by storing a `Decimal` instance.

## Verification Notes (2026-09-10)
Verified by running the actual suites and a live dev server against the real provider — not by
inspection. Two real, previously-undetected bugs surfaced during this pass and were fixed in place
(both are in this phase's own files or the one shared seam it touches; no unrelated refactoring):

1. **Snapshot-write race could crash the app.** `RateSnapshotScheduler.runSnapshot()` only wrapped
   the provider fetch in try/catch; the upsert + alert-evaluation block after it was not caught. Two
   concurrent app boots (reproduced by running the full e2e suite, where three specs each boot
   `AppModule` and each triggers the `onModuleInit` bootstrap) raced on the same `(JPY,VND,today)`
   upsert, and the loser's `PrismaClientKnownRequestError` (P2002) propagated out of
   `onModuleInit`, crashing that suite's app init. Fixed by wrapping the whole
   upsert-through-alert-evaluation block in its own try/catch (`rate-snapshot.scheduler.ts`) — a
   losing race is now treated as "another instance already wrote today's row," logged, and
   swallowed, matching the phase's own non-functional requirement that a snapshot problem must
   never crash the app. Confirmed fixed: `pnpm run test:e2e` went from 1 failing suite to 5/5 green.
2. **`DecimalSerializerInterceptor` used `instanceof Decimal`, which silently failed against real
   Prisma query results** (Prisma's query engine constructs `Decimal` through its own bundled copy
   of decimal.js, not always the same class reference `@prisma/client/runtime/library` exports to
   application code). Every money/rate field fell through to the interceptor's generic
   object-recursion branch and leaked decimal.js internals — reproduced live via
   `curl -X PATCH /api/rate-alerts/:id` returning `"threshold":{"s":1,"e":2,"d":[175]}` instead of
   `"175.00000000"`, the exact shape the frontend team reported for Goals/SavingsEntries. Fixed by
   switching the check to `Decimal.isDecimal(value)` (decimal.js's own cross-copy-safe duck-type
   check) in `common/decimal.serializer.interceptor.ts`. Also found: the interceptor was only wired
   via `app.useGlobalInterceptors()` in `main.ts`, so no e2e test (which builds its own
   `NestApplication` from `AppModule` and never calls `bootstrap()`) ever exercised it — moved the
   registration to `{ provide: APP_INTERCEPTOR, useClass: DecimalSerializerInterceptor }` in
   `app.module.ts` (same pattern already used for `APP_GUARD`), so it now applies everywhere the app
   is constructed, and removed the now-redundant line from `main.ts`.
- **Cron idempotency (success criterion 1):** added `test/rate-snapshot-idempotency.e2e-spec.ts` —
  boots `ExchangeRateModule` for real against `okane_test`, asserts exactly one `RateSnapshot` row
  after the `onModuleInit` bootstrap, then manually re-invokes the private `runSnapshot()` routine
  (simulating the daily cron firing later) and asserts the row count is still exactly one. Both
  assertions pass against the live provider (`open.er-api.com`).
- **Alert crossing / isolation / empty-table 404 (success criteria 3–4, Implementation Step 11):**
  added `test/rate-alerts-isolation.e2e-spec.ts` — two users, cross-user 404 on read/update/delete,
  self-access still works, non-positive threshold rejected (400), the 10-alerts-per-user cap is
  enforced (11th create → 400), and `GET /rates/current` against a table cleared of snapshots
  returns 404 (never 500). 7/7 green.
- **Decimal serialization end-to-end (curl evidence, dev server against the real DB):** created a
  goal (`targetAmount:"1000000.00"`), logged a cross-currency VND entry against it
  (`amountInGoalCurrency:"2968.51"`, `fxRateUsed:"168.43447600"`), then fetched the goal detail,
  the dashboard, and the entries list — every top-level *and* nested Decimal field (including
  `progress.savedAmount`, `progress.remainingInOtherCurrency`, `progress.rateUsed`) came back as a
  correctly fixed-scale string after the `isDecimal` fix, none as raw decimal.js internals.
- **Two Phase-4 contract deviations the frontend flagged were confirmed real** (both live via curl
  and against phase-04's own frozen endpoint table) and fixed at the source rather than left to the
  frontend's client-side adapters:
  - `GET /goals/:id/entries` returned a bare array; now returns `{ entries, nextCursor }`
    (`savings-entries.service.ts`), with `nextCursor` computed via a limit+1 fetch.
  - Dashboard `recentEntries` carried a nested `{ goal: { name } }`; now a flat `goalName` string
    (`dashboard.service.ts`).
- **Environment-only finding, fixed in test infra (not app code):** every e2e suite — including
  Phase 3/4's already-committed ones — was silently connecting to the **dev** `okane` database
  instead of `okane_test`, despite `app.module.ts`'s documented intent. Root cause: `@prisma/client`
  auto-loads `.env` as an import-time side effect, which runs before `AppModule`'s own
  `ConfigModule.forRoot({ envFilePath: '.env.test' })` — and dotenv never overrides an
  already-set variable, so the `.env.test` override was silently lost. Confirmed live: a manual
  cron run left a stray `RateSnapshot` row in dev `okane`. Fixed via
  `test/setup-e2e-env.ts` (a `vitest` `setupFiles` entry that loads `.env.test` first, before any
  spec's own imports) and `fileParallelism: false` in `vitest.config.e2e.ts` (Phase 5 is the first
  phase with genuinely global, non-per-user shared tables — `RateSnapshot`/`RateAlert` — so
  cross-file races on them are now possible in a way Phase 3/4's per-user data wasn't exposed to).
  This is scoped to test config only; no production code path was affected (production always used
  plain `.env` regardless).
- **Provider-unreachable success criterion:** re-ran the idempotency spec with
  `FX_API_URL=https://invalid.does-not-exist.example.com/...`. Confirmed live: the scheduler logged
  `Rate snapshot fetch failed, no row written for today: TypeError: fetch failed` and did not
  crash or throw past `onModuleInit` (a pre-existing snapshot row from the prior day was left
  untouched, standing in for "the app keeps serving the last snapshot"). Not independently
  re-verified: exercising this through a live `/rates/current` HTTP call mid-outage (checked the DB
  row directly instead, which is the same underlying read path).

## Success Criteria
- After one cron run against the live provider, `RateSnapshot` holds exactly one row for today with
  a rate in a sane band (roughly 150–190 VND per JPY as of 2026-09), and re-running adds none.
- With the provider unreachable (simulate by pointing `FX_API_URL` at an invalid host), the cron
  logs an error, writes nothing, and **the app keeps serving** `/rates/current` from the last snapshot.
- An `ABOVE 170` alert fires exactly once on the day the rate goes 169 → 171, and does not fire again
  on the following 172 day.
- `/rates/history?range=1y` on a 3-day-old database returns 3 points with `coverage: "partial"` —
  and does not error.

## Risk Assessment
| Risk | Likelihood | Impact | Countermove |
|---|---|---|---|
| Provider changes shape, disappears, or rate-limits | Medium | High | Strict payload validation (never store an unvalidated number); `FX_API_URL` is config, so swapping providers is an env change plus one client file; historical rows already captured survive the switch |
| Chart looks empty/broken at launch | **High** (certain, by design) | Medium | `coverage` field + an explicit "history is building" UI state (Phase 9); 90 seeded days for development; disclose the limitation in the UI rather than hiding it |
| Cron never fires (laptop asleep, process restarted) | High in dev | Medium | `onModuleInit` bootstrap catch-up; `isStale` flag surfaced to the UI |
| Alert spam from a persisting condition | Medium | Medium | Crossing-only evaluation + the dedicated unit test for the persisting case |
| User reads "alerts" as push notifications | **High** | Medium | UI copy states "checked once daily, shown here" — no email/push in MVP; delivery is backlog |
| Duplicate snapshot from a concurrent bootstrap + cron | Low | Low | DB unique constraint + `upsert` makes the race harmless |
| Timezone confusion (JST vs UTC dates) | Medium | Medium | Store `capturedOn` as a **UTC date**; label it consistently; state the convention in `docs/data-model.md` |

**Rollback:** revert this phase's commit and drop `ScheduleModule` from `AppModule`. Snapshot rows
already collected are harmless and worth keeping — they are irreplaceable (no backfill source exists).

## Security Considerations
- Outbound-only call to a fixed, config-pinned HTTPS URL; nothing user-supplied enters the URL.
- Provider response is validated and never echoed raw to clients.
- `/rates/current`, `/rates/history`, `/rates/convert` are safe to leave authenticated (default global
  guard) — the rate ticker only appears inside the app. **Do not** mark them `@Public()` without a reason.
- Alert endpoints are user-scoped; the isolation e2e covers them.
- The cron logs must never include the full provider payload at info level (needless noise, and it
  invites logging secrets if the provider is ever swapped for a keyed one).
- If a keyed provider is adopted later, the key goes in `.env` (`FX_API_KEY`) and never in `VITE_*`.

## Next Steps
→ Phase 4 wires `getLatestRate()` for entry conversion and goal math.
→ Phase 9 consumes `/rates/*` for the rate hero, chart, converter, and alert list.
