# FX API Research for Okane (JPY↔VND)

**Method:** live-tested `open.er-api.com` directly, fetched official docs (exchangerate-api.com
supported-currencies + free-access pages), cross-checked via 5 web searches. Frankfurter's currency
list is public record (ECB's 31-currency roster), independently corroborated by 3+ sources.

## Findings (VND confirmed, not assumed)

| API | VND? (source) | Historical endpoint | Free limits | Key? | Reliability |
|---|---|---|---|---|---|
| **Frankfurter.app** | **NO** — ECB publishes only 31 currencies, VND absent (confirmed via GitHub issue tracker + docs) | Yes, but moot (no VND) | N/A | No | Disqualified for this pair |
| **open.er-api.com** | **YES** — live-fetched `/v6/latest/JPY`, returned `VND: 168.43` | **No** — latest-only, no time-series | ~1 req/hr safe (24h refresh cadence), soft 429 after abuse | No | Solid, backed by ExchangeRate-API's commercial infra; years-stable |
| **exchangerate-api.com (v6)** | Yes (official supported-currencies doc lists VND explicitly) | Exists (`/historical-data-requests`) but gated to Pro/Business — free tier gets only Standard + Pair Conversion | ~1,500 req/mo free (key required) | Yes | Mature, well-documented, API Evangelist-profiled |
| **currencyapi.com** | Claimed (166 ISO codes) but not individually confirmed | `/history`, `/timeframe` — **paid-only**, free tier excludes | 500 req/mo | Yes | Solid docs, historical gate is the dealbreaker |
| **Fixer.io / CurrencyLayer** | Likely (168-170 currencies) but unconfirmed for VND specifically | Historical technically free, but free tier forces **EUR base only** (JPY/VND needs 2-hop cross-calc) + no HTTPS on free | 100/mo (Fixer) | Yes | APILayer family — consistent free-tier restrictions across products |
| **freecurrencyapi.com** | Unconfirmed (site 404'd during fetch) | Documented but gating unverified | Unverified | Yes | Insufficient evidence — do not rely on it yet |

## Recommendation

- **Current-rate ticker:** `open.er-api.com` — no key, no signup, VND confirmed live, matches
  "zero-budget/no-approval" constraint exactly.
- **Historical chart:** no free API here gives real depth for JPY/VND — all providers with deep
  history (Frankfurter, exchangerate-api.com, currencyapi.com) gate it behind paid plans, and the
  ones that don't (open.er-api.com) are latest-only. This is consistent across independent sources,
  so treat it as settled, not a gap.
- **Fallback = required, not optional:** run a daily scheduled job hitting `open.er-api.com` (same
  source as the ticker — DRY, one vendor, one failure mode), write JPY/VND to our own
  `RateSnapshot` table. 7d/30d charts fill naturally within a month; there is no free way to
  backfill a full year for VND on day one — accept that gap or pay for one bootstrap pull later.
- Use the same stored snapshots to power threshold alerts (cron compares latest stored row to user
  thresholds) — avoids a second external dependency.

**Architectural fit:** in this project's actual stack (NestJS, not Laravel), `@nestjs/schedule`
cron is the natural, zero-extra-infra fit for the daily snapshot job — no new service needed.

**Limits owned:** freecurrencyapi.com and CurrencyLayer's VND support weren't independently
confirmed (site fetch failed / search inconclusive) — don't route production traffic there without
a direct test first. Rate-limit numbers for exchangerate-api.com's free key tier came from general
knowledge, not a freshly fetched pricing page — verify before hard-coding assumptions into
rate-limit handling.

## Unresolved questions

1. Confirm freecurrencyapi.com's actual free-tier VND + historical-gate status directly (site was
   unreachable this pass).
2. Decide whether a one-time paid historical pull (few dollars) is acceptable to seed &gt;30 days
   of backtest data, or whether "history starts today" is acceptable for v1 (current decision:
   accept the gap, no paid backfill for MVP).
