# Phase 5: Exchange-Rate Backend (provider, snapshot cron, history, alerts)

## Context Links
- Plan overview: [plan.md](plan.md)
- Depends on: [phase-02](phase-02-prisma-schema-and-data-isolation.md) (`RateSnapshot`, `RateAlert`),
  [phase-03](phase-03-auth-backend-jwt.md) (per-user alert scoping only — the cron needs no auth)
- Consumed by: [phase-04](phase-04-goals-and-entries-backend.md) (`getLatestRate()`),
  [phase-09](phase-09-exchange-and-convert-ui.md)

## Overview
- **Priority:** High — the FX feature set is the product's differentiator.
- **Status:** pending
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
- [ ] `@nestjs/schedule` installed and `ScheduleModule.forRoot()` registered
- [ ] Provider client with timeout, payload validation, and retry/backoff
- [ ] Daily `@Cron` at 01:00 UTC + `onModuleInit` bootstrap when today's snapshot is missing
- [ ] Snapshot upsert idempotent on `(JPY, VND, date)`
- [ ] `getLatestRate()` (Phase 4's dependency) + `getLatest()` + `getHistory(range)`
- [ ] `/rates/current` reports `asOf` and `isStale`; `/rates/history` reports `coverage`
- [ ] `/rates/convert` with a pure, unit-tested converter
- [ ] Rate-alert CRUD, user-scoped, capped per user
- [ ] Pure crossing evaluator — **no re-trigger while the condition merely persists**
- [ ] Converter + evaluator unit suites green (all listed cases)
- [ ] Alert isolation e2e green; empty-table read path does not 500
- [ ] Verified: running the cron twice in one day creates exactly one row

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
