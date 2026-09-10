# Phase 9: Exchange & Convert UI (rate, chart, converter, alerts)

## Context Links
- Plan overview: [plan.md](plan.md)
- Depends on: [phase-06](phase-06-react-app-shell.md) (shell/primitives),
  [phase-05](phase-05-exchange-rate-backend.md) (`/rates/*` endpoints, `coverage`, `isStale`)
- Provides to: [phase-08](phase-08-goals-ui.md) — the dashboard's `RateTicker`
- Approved mockup screen: Exchange & Convert — **do not redesign**

## Overview
- **Priority:** High — the differentiating screen.
- **Status:** pending
- **Effort:** 4h
- The big current-rate figure, the 7d/30d/1y history chart, the JPY⇄VND quick converter, the rate
  threshold alerts list, the Smiles Wallet outbound link, and the dashboard rate ticker.

## Key Insights
- **The chart will be nearly empty at launch and there is no way around it.** No free API carries
  JPY/VND history, so the table fills one row per day from first run. The honest design shows
  what we have and says so: with `coverage: "partial"`, render the available points and a quiet
  note ("history since {firstDate} — a new point is added daily"). Faking a curve would be lying to
  the user about financial data.
- **Fewer than two points is not a chart.** One point renders as a single value with a caption;
  zero points renders an empty state. Handle these explicitly — most chart libraries render
  something confusing or throw.
- **`asOf` is always visible.** The rate updates once a day; a big number with no timestamp reads as
  live. When `isStale` is true, mark it in vermilion. Users may make remittance decisions from this
  figure — the freshness is part of the datum.
- **The converter needs no network call.** The current rate is already loaded; conversion is local
  arithmetic mirroring the server's formula. `POST /rates/convert` exists for the future mobile
  client and for verification, but making the web input round-trip per keystroke would be pointless
  latency. Keep the two formulas identical and note the duplication deliberately (the alternative —
  a debounced request per keystroke — is worse on every axis).
- **Alerts are checked once daily.** The copy must say exactly that. No push, no email in MVP; a
  triggered alert shows "triggered on {date} at {rate}" in the list. Promising more would be the
  single easiest way to lose a user's trust.
- **The Smiles Wallet link is a plain anchor** to `https://www.smileswallet.com/japan/vi/` with
  `target="_blank" rel="noopener noreferrer"`. No API exists; nothing else to build.

## Requirements
**Functional**
- Current rate hero: big figure, pair label, `asOf`, staleness indicator.
- History chart with 7d / 30d / 1y range toggle.
- Bidirectional converter (typing in either field updates the other).
- Alerts: list, create (direction + threshold), toggle active, delete; show last-triggered info.
- Outbound Smiles Wallet link.
- `RateTicker` compact component for the dashboard.

**Non-functional**
- Chart bundle kept modest; the page must remain usable on a mid-range phone.
- Chart colors, grid, and tooltip come from the design tokens and follow the theme.
- All strings from the i18n dictionary; rates rendered in mono with tabular figures.

## Architecture
```
apps/web/src/features/exchange/
├── exchange-page.tsx
├── components/
│   ├── rate-hero.tsx · rate-ticker.tsx        # ticker also used by the dashboard
│   ├── rate-chart.tsx · range-toggle.tsx
│   ├── currency-converter.tsx
│   ├── alert-list.tsx · alert-form.tsx
│   └── smiles-link.tsx
├── hooks/{use-current-rate.ts,use-rate-history.ts,use-alert-mutations.ts}
└── exchange.api.ts
```

**Data flow**
```
ExchangePage
 ├ useCurrentRate()          → GET /api/rates/current   → { rate, asOf, isStale }
 │     └─ feeds RateHero AND CurrencyConverter (one fetch, two consumers)
 ├ useRateHistory(range)     → GET /api/rates/history?range=…  → { points, coverage }
 │     └─ range change refetches; keep previous data to avoid a chart flash
 └ useAlerts()               → GET /api/rates/alerts
       mutations → POST/PATCH/DELETE → invalidate ['alerts']

Dashboard (Phase 8) → RateTicker → useCurrentRate()  ← shared query key, so no duplicate request
```

**Chart rendering rules**
| `pointCount` | Render |
|---|---|
| 0 | `EmptyState`: "rate history is still being collected" |
| 1 | the single value + date, with the same caption — no axes |
| ≥2 | line chart; if `coverage === "partial"`, a caption naming the first available date |

Gaps (a day the cron failed) are **connected, never interpolated into fake points** — the series
simply has no entry for that date.

**Converter math (mirrors Phase 5 exactly)**
```
JPY→VND: amount × rate        VND→JPY: amount ÷ rate
Format with formatMoney (0 decimals for both currencies).
No rate loaded → inputs disabled + explanatory note, never a silent 1:1.
```

## Related Code Files
**Create:** all files in the tree above.

**Modify:**
- `apps/web/src/app/routes.tsx` — fill `/exchange` (append-only)
- `apps/web/src/features/goals/dashboard-page.tsx` — swap the placeholder for the real `RateTicker`
  (the single agreed cross-phase edit; the props shape was fixed in Phase 8)
- `apps/web/src/i18n/locales/{vi,ja}.json` — exchange strings

## Implementation Steps
1. `pnpm --filter web add recharts`. Chosen over Chart.js/visx: declarative React API, responsive
   container, theming via props — the least code for one line chart. Note the ~100KB gzipped cost as
   accepted for the app's signature screen; revisit only if the bundle becomes a real problem.
2. `exchange.api.ts` typed against Phase 5's endpoints.
3. `useCurrentRate` with a shared query key (`['rate','current']`) so the ticker and the page
   deduplicate into one request. `staleTime` 5 minutes — the source moves once a day.
4. `RateHero` from the mockup: big mono figure, "1 JPY = X VND", `asOf` date, and a vermilion
   "rate may be outdated" note when `isStale`.
5. `RangeToggle` (7d / 30d / 1y) as a segmented control from the tokens; keep the selection in
   component state, feeding the query key.
6. `RateChart` with Recharts `ResponsiveContainer` + `LineChart`; stroke `var(--color-primary)`,
   grid `var(--color-line)`, a themed tooltip. Implement the three `pointCount` cases in the table
   above **before** styling — they are the part most likely to be skipped.
7. Read CSS custom properties for chart colors via `getComputedStyle` on the document element (or
   pass resolved values from `ThemeContext`) and re-read on theme change, so the chart follows dark
   mode instead of staying light.
8. `CurrencyConverter`: two inputs with a swap button; typing in either updates the other; local
   math per the formulas above; both fields disabled with a note when no rate is available.
9. `AlertList` + `AlertForm`: direction select (above/below), threshold input, active toggle,
   delete. Each row shows "checked daily" and, when present, "last triggered {date} at {rate}".
   Enforce the per-user cap (Phase 5) in the UI with a clear message rather than surfacing a raw 400.
10. `SmilesLink`: anchor with `target="_blank" rel="noopener noreferrer"` and an external-link icon.
11. `RateTicker`: compact `1 JPY = X ₫` + `asOf`, linking to `/exchange`. Export it for the dashboard
    and replace Phase 8's placeholder.
12. Add all strings to `vi.json`/`ja.json`, including the history-coverage caption and the
    "checked once daily" alert copy in both languages.
13. Manual verification: seeded 90-day data renders all three ranges; then test against a nearly
    empty table (truncate snapshots locally) to confirm the 0/1-point paths.

## Todo List
- [ ] Recharts installed; cost consciously accepted
- [ ] `exchange.api.ts` + hooks; `useCurrentRate` shared key (ticker and page = one request)
- [ ] `RateHero` with `asOf` always shown and a staleness indicator
- [ ] `RangeToggle` 7d/30d/1y wired into the query key, previous data kept on switch
- [ ] `RateChart` handling 0, 1, and ≥2 points; gaps not interpolated
- [ ] Chart colors follow the active theme (verified by toggling dark mode)
- [ ] `coverage: "partial"` caption naming the first available date
- [ ] Bidirectional converter with local math matching the server formula; disabled with no rate
- [ ] Alerts: list/create/toggle/delete, "checked daily" copy, last-triggered display, cap handled
- [ ] Smiles Wallet link with `rel="noopener noreferrer"`
- [ ] `RateTicker` replacing the dashboard placeholder
- [ ] VI + JA strings complete
- [ ] Verified against both the seeded 90 days and a nearly empty table

## Success Criteria
- The hero shows the current rate with a visible as-of date matching the newest snapshot.
- All three ranges render without error against seeded data, and 1-point / 0-point databases render
  their intended states rather than a broken axis or a crash.
- Typing `50000` in the JPY field yields the same VND figure the API's `/rates/convert` returns for
  the same input (compare once by hand — this is the check that keeps the duplicated formula honest).
- Toggling dark mode restyles the chart, not just the surrounding page.
- The dashboard and the exchange page together issue **one** `/rates/current` request, not two.
- Alert copy states the daily cadence in both VI and JA; nothing implies push notifications.

## Risk Assessment
| Risk | Likelihood | Impact | Countermove |
|---|---|---|---|
| Chart looks broken/empty at launch | **High** (by design) | Medium | Explicit 0/1/≥2 states + the coverage caption; disclose rather than disguise |
| Duplicated conversion formula drifting from the server's | Medium | Medium | Identical formula documented in both phase files; the hand-comparison check in Success Criteria; if it ever drifts, switch the web client to `/rates/convert` |
| Recharts bundle weight | Medium | Low | Accepted for the signature screen; route-level code splitting via `React.lazy` if the initial load suffers |
| Chart not following the theme | Medium | Low | Resolve token values at render and re-read on theme change (step 7) |
| User treats the daily rate as live/tradeable | Medium | Medium | `asOf` always visible, staleness marked, and the Smiles link points to a real remittance provider for the actual transaction |
| Stale-rate day (cron failed) reads as "the rate did not move" | Medium | Medium | `isStale` indicator; the chart shows a gap, not a flat line |
| Alert thresholds set in the wrong direction (above vs below) | Medium | Low | The form previews the rule in words: "notify me when 1 JPY goes above 170 ₫ (currently 168.43)" |

**Rollback:** revert this phase's commit; restore the dashboard's ticker placeholder. Backend and
data untouched.

## Security Considerations
- `rel="noopener noreferrer"` on the Smiles link — without it the opened page can manipulate
  `window.opener`.
- Rate endpoints stay behind the global auth guard; the ticker only renders inside the app.
- Alert CRUD is user-scoped server-side (Phase 5 isolation e2e); the UI adds no authorization logic.
- Threshold input validated client-side (positive, sane band) and server-side; the server is authoritative.
- No external chart CDN — Recharts is bundled, so no third-party script executes in the app origin.

## Next Steps
→ Phase 10: cross-screen QA, i18n and accessibility sweep, hardening checklist.
