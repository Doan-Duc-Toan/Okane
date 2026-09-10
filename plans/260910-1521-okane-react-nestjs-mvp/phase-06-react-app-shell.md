# Phase 6: React App Shell (design tokens, theme, i18n, routing, API client)

## Context Links
- Plan overview: [plan.md](plan.md)
- Depends on: [phase-01](phase-01-monorepo-scaffold-and-dev-environment.md) only — **no backend
  dependency**, so this runs in parallel with Phases 2–5.
- Approved mockup (5 screens, do not redesign): `https://claude.ai/code/artifact/12757e68-92ec-4463-b440-98f9241db3cc`
- API contracts consumed later: [phase-03](phase-03-auth-backend-jwt.md), [phase-04](phase-04-goals-and-entries-backend.md), [phase-05](phase-05-exchange-rate-backend.md)

## Overview
- **Priority:** Blocking for all UI phases.
- **Status:** done
- **Effort:** 5h
- The foundation every screen sits on: the design-token stylesheet, dark mode, VI/JA i18n,
  the router with all routes pre-declared, the authenticated fetch client, TanStack Query,
  and the shared primitives (layout, money/rate formatting).

## Key Insights
- **The tokens are already decided and user-approved. Transcribe them; do not invent variants.**
  Any color the mockup does not define is a design decision, and design decisions are not this
  phase's to make — go back to the mockup instead.
- **The mockup's hand-rolled `data-i18n` attribute pattern is a prototype technique, not a
  production one.** Replace it with `react-i18next` (chosen: largest ecosystem, plural/interpolation
  built in, mature language detection and persistence). Copy the string dictionary out of the mockup
  verbatim — the wording is approved; only the mechanism changes.
- **Noto Sans was chosen deliberately for Vietnamese + Japanese glyph coverage.** Do not "improve"
  the font stack. Load the Vietnamese and Japanese subsets, or Vietnamese diacritics will fall back
  to a different face mid-sentence.
- **Money and rates use IBM Plex Mono with `font-variant-numeric: tabular-nums`.** Without tabular
  figures, amounts in a list jitter column-to-column as digits change. This is why a `<Money>`
  primitive exists rather than raw string interpolation.
- **All routes are declared in this phase**, pointing at placeholder elements. Phases 7/8/9 then
  swap one element each — an append, never a restructure — which is what keeps them parallel-safe.
- **Token storage decision (accepted risk, stated openly):** access token in memory, refresh token
  in `localStorage`. An httpOnly cookie would be stronger against XSS, but cookies do not carry to
  the planned React Native client, which was the whole reason JWT was chosen. Mitigations: 15-minute
  access TTL, refresh rotation with reuse detection (Phase 3), no `dangerouslySetInnerHTML`
  anywhere, and a CSP at deploy time. Upgrade path (backlog): cookie for web, bearer for mobile.

## Requirements
**Functional**
- Light/dark theme toggle, persisted, honoring `prefers-color-scheme` on first visit.
- VI/JA toggle, persisted, applied without a reload; VI is the default.
- Router with all five screens plus 404; unauthenticated users are redirected to `/login`.
- One fetch client that attaches the access token, transparently refreshes on 401, and retries once.
- TanStack Query provider with sane defaults.

**Non-functional**
- Every component file under 200 lines (project rule).
- No `dangerouslySetInnerHTML` anywhere in the codebase — a hard rule, not a preference.
- Theme applied before first paint (no white flash in dark mode).

## Architecture
```
apps/web/src/
├── main.tsx                       # providers: Query · I18n · Theme · Auth · Router
├── app/
│   ├── routes.tsx                 # ALL routes declared here (created in Phase 1, filled here)
│   └── protected-route.tsx
├── styles/
│   ├── tokens.css                 # the approved token set, verbatim
│   ├── global.css                 # reset, base type, focus rings
│   └── fonts.css
├── i18n/
│   ├── index.ts                   # i18next init, persistence, VI default
│   └── locales/{vi.json,ja.json}  # dictionary lifted from the mockup
├── lib/
│   ├── api-client.ts              # fetch wrapper + 401 refresh interceptor
│   ├── query-client.ts
│   └── format.ts                  # formatMoney · formatRate · formatDate  (unit-tested)
├── contexts/
│   ├── theme-context.tsx          # light|dark|system, localStorage, data-theme attribute
│   └── auth-context.tsx           # access token in memory, refresh in localStorage
└── components/
    ├── layout/{app-shell.tsx,top-nav.tsx,theme-toggle.tsx,language-toggle.tsx}
    └── ui/{button,card,input,select,money,progress-bar,empty-state,error-state,spinner}
```

**Design tokens (`tokens.css`) — approved values, transcribe exactly**
```css
:root {
  --color-primary:      #1f3a5f;  /* ai-iro indigo */
  --color-positive:     #3f6b52;  /* jade — progress, gains */
  --color-alert:        #b5482f;  /* vermilion — alerts, destructive */
  --color-bg:           #f7f4ec;  /* warm paper */
  --color-surface:      #fffdf8;
  --color-line:         #e2dcc9;
  --font-heading: "Zen Kaku Gothic New", sans-serif;
  --font-body:    "Noto Sans", sans-serif;          /* VI + JA glyph coverage — do not change */
  --font-mono:    "IBM Plex Mono", monospace;       /* money & rates, tabular-nums */
}
[data-theme="dark"] {
  --color-primary:  #7ea1cc;
  --color-positive: #86b494;
  --color-alert:    #e08a70;
  --color-bg:       #12151c;
  --color-surface:  #1a1e27;
  --color-line:     #2b2f3a;
}
```
Take spacing, radius, shadow, and type-scale tokens from the mockup as well — the list above is the
palette and type core, not the complete set. Read the mockup source before writing this file.

**Theme resolution**
```
first visit  → localStorage empty → 'system' → matchMedia('(prefers-color-scheme: dark)')
toggle       → light | dark → localStorage['okane.theme'] → <html data-theme="...">
before paint → a tiny inline script in index.html sets data-theme from localStorage
               (a React effect runs after first paint → visible flash)
```

**API client**
```
request(path, init)
  ├─ attach Authorization: Bearer <in-memory access token>
  ├─ 401 && a refresh token exists && not already retrying
  │     ├─ POST /api/auth/refresh  (single-flight: concurrent 401s share one refresh promise)
  │     ├─ success → store new pair, retry the original request once
  │     └─ failure → clear session, redirect to /login
  └─ non-2xx → throw ApiError { status, message } for TanStack Query to surface
```
Single-flight matters: the dashboard fires several queries at once, and without it an expired token
triggers N parallel refreshes, N−1 of which look like token reuse and (per Phase 3) nuke the session.

**Routes (all declared now, elements filled later)**
| Path | Screen | Filled by |
|---|---|---|
| `/login` | Login | Phase 7 |
| `/register` | Register | Phase 7 |
| `/` | Dashboard | Phase 8 |
| `/goals/new` | New Goal | Phase 8 |
| `/goals/:id` | Goal Detail | Phase 8 |
| `/exchange` | Exchange & Convert | Phase 9 |
| `*` | Not Found | Phase 6 |

## Related Code Files
**Create:** every file in the tree above, plus `apps/web/index.html` (fonts + the pre-paint theme
script) and `apps/web/src/lib/format.spec.ts`.

**Modify:**
- `apps/web/src/app/routes.tsx` — created empty in Phase 1, filled here
- `apps/web/src/main.tsx` — provider stack
- `apps/web/vite.config.ts` — path alias `@/` → `src/`

## Implementation Steps
1. `pnpm --filter web add react-router @tanstack/react-query i18next react-i18next i18next-browser-languagedetector`;
   `-D vitest @testing-library/react @testing-library/jest-dom jsdom`.
2. **Read the mockup source and extract the complete token set** — palette, spacing, radii, shadows,
   type scale — into `tokens.css`. Do not paraphrase values.
3. `fonts.css` / `index.html`: load Zen Kaku Gothic New, Noto Sans (**Vietnamese + Japanese subsets**),
   IBM Plex Mono via Google Fonts with `display=swap` and a `preconnect`.
4. `global.css`: box-sizing reset, `body { background: var(--color-bg); font-family: var(--font-body) }`,
   visible `:focus-visible` outlines (keyboard accessibility is not optional), `.mono { font-variant-numeric: tabular-nums }`.
5. Pre-paint theme script in `index.html`: read `localStorage['okane.theme']`, fall back to
   `matchMedia`, set `document.documentElement.dataset.theme`. Keep it inline and tiny.
6. `theme-context.tsx`: `{ theme, resolvedTheme, setTheme }`; persist; subscribe to `matchMedia`
   changes while the preference is `system`. Once the API exists, mirror the choice to
   `PATCH /users/me` so it follows the user across devices (best-effort; local storage stays authoritative).
7. `i18n/index.ts`: resources vi/ja, `fallbackLng: 'vi'`, language detector ordered
   `localStorage → navigator`, cache to `localStorage['okane.lang']`. Set `<html lang>` on change.
8. Port the mockup's full string dictionary into `vi.json` / `ja.json`, keyed by screen
   (`dashboard.title`, `goal.progress`, …). **Every string in the app comes from the dictionary** —
   a hardcoded literal in a later phase is a bug, and it will be checked in Phase 10.
9. `format.ts`:
   - `formatMoney(value: string, currency)` → `Intl.NumberFormat(locale, {style:'currency', currency, maximumFractionDigits:0})`
     (both JPY and VND are zero-decimal; parse the API's **string** amounts, never a pre-cast number).
   - `formatRate(value: string)` → 2–4 significant decimals with tabular figures.
   - `formatDate(iso, locale)` → locale-aware short date.
10. `api-client.ts` per the flow above, including the single-flight refresh.
11. `query-client.ts`: `staleTime` 30s, `retry: 1`, `refetchOnWindowFocus: false`
    (an FX page that silently refetches on every focus is noise, given a rate that moves once a day).
12. `auth-context.tsx`: access token in a module variable (never in state that lands in devtools-serializable
    stores), refresh token in `localStorage['okane.refresh']`, `login/logout/restore` helpers.
    On boot, if a refresh token exists, attempt a silent refresh before rendering the router.
13. `app-shell.tsx`: top nav matching the mockup (brand, Dashboard / Exchange links, theme toggle,
    language toggle, sign-out), `<Outlet/>` beneath.
14. UI primitives — thin and token-driven: `Button` (primary/ghost/danger), `Card`, `Input`, `Select`,
    `Money` (mono + tabular-nums), `ProgressBar` (jade fill, capped at 100% visually, true % in the label),
    `EmptyState`, `ErrorState`, `Spinner`.
15. `ProtectedRoute`: no session → `<Navigate to="/login" replace/>`; restoring → spinner.
16. Unit tests (`format.spec.ts`): JPY and VND formatting under both locales, zero, a very large
    amount, and a decimal string that would lose precision if cast to `Number`.
17. Verify: toggle theme → persists across reload with **no flash**; toggle VI/JA → every visible
    string changes with no reload; `/` while signed out → redirects to `/login`.

## Todo List
- [x] Frontend dependencies installed; `@/` alias configured
- [x] `tokens.css` transcribed from the mockup (palette + spacing/radius/type scale)
- [x] Fonts loaded with Vietnamese **and** Japanese subsets
- [x] Pre-paint theme script — no dark-mode flash
- [x] `ThemeContext` with light/dark/system + persistence + `matchMedia` subscription
- [x] i18next configured, VI default, persisted; `<html lang>` updated
- [x] Full VI/JA dictionary ported from the mockup
- [x] `format.ts` parses **string** money values; unit tests green
- [x] `api-client.ts` with single-flight 401 refresh + retry-once
- [x] TanStack Query provider configured
- [x] `AuthContext`: access in memory, refresh in localStorage, silent restore on boot
- [x] `AppShell` + nav matching the mockup
- [x] UI primitives incl. `Money` (tabular-nums) and `ProgressBar`
- [x] All 7 routes declared with placeholders; `ProtectedRoute` working
- [x] Verified: theme persists flash-free, language switches live, guest is redirected

**Verification notes (2026-09-10):** confirmed via a headless Puppeteer check (not just build
output) — guest visiting `/` redirects to `/login`; explicit `okane.theme=dark` renders
`rgb(18,21,28)` body background (dark `--paper`); `prefers-color-scheme: dark` with **no** stored
choice renders the same dark background with `data-theme` left unset (proves the flash-free
CSS-only path); flipping back to a light system preference renders `rgb(247,244,236)` (light
`--paper`); zero console/page errors throughout. `pnpm --filter web build`, `test` (7/7), and
`lint` (oxlint, 2 non-blocking `only-export-components` fast-refresh warnings on the two context
files — accepted, standard React context+hook co-location) all pass.

## Success Criteria
- Reloading in dark mode shows **no white flash** (verify visually, and by throttling the network).
- Switching VI↔JA changes every visible string with no reload and survives a refresh.
- A Vietnamese string with full diacritics (e.g. "Mục tiêu tiết kiệm của tôi") and a Japanese string
  render in the intended faces with no fallback-font substitution — check in the browser's font panel.
- Money in a column of a list stays digit-aligned as values change (tabular-nums proof).
- With an expired access token, three simultaneous queries trigger **exactly one** refresh call
  (observe the network panel) — proves single-flight and avoids Phase 3's reuse-detection tripwire.

## Risk Assessment
| Risk | Likelihood | Impact | Countermove |
|---|---|---|---|
| Token values drifting from the approved mockup | Medium | Medium | Transcribe from the mockup source in one sitting; never hand-pick a "close enough" hex |
| Concurrent 401s triggering refresh-reuse → user logged out mid-session | **High** without care | High | Single-flight refresh (step 10) + the explicit three-query check in Success Criteria |
| XSS lifting the refresh token from localStorage | Low | High | Accepted, with mitigations (15m access TTL, rotation + reuse detection, no `dangerouslySetInnerHTML`, CSP at deploy); upgrade path noted in backlog |
| Font subsets missing Vietnamese diacritics | Medium | Medium | Explicit `subset=vietnamese,japanese`; verified visually in Success Criteria |
| Hardcoded strings creeping in during Phases 7–9 | **High** | Medium | Dictionary-only rule stated here and re-checked in Phase 10's i18n sweep |
| Mockup source unreachable when this phase runs | Medium | High | The palette/font core is transcribed in this file; if the artifact cannot be fetched, ask the user to paste the token block rather than improvising values |
| Router restructured by a later phase, breaking parallel work | Low | Medium | All routes declared now; later phases swap an element only |

**Rollback:** frontend-only and self-contained; revert the commit. No backend or data effect.

## Security Considerations
- Access token never written to `localStorage`, never logged, never placed in a URL.
- **No `dangerouslySetInnerHTML` anywhere** — React's default escaping is what keeps user-entered
  goal names and notes inert.
- Only `VITE_API_URL` is exposed to the client bundle; no secret may ever be a `VITE_*` variable.
- On logout, clear the in-memory token, remove the stored refresh token, **and** call
  `POST /api/auth/logout` so the server revokes it — clearing only the client leaves a live token.
- Language and theme preferences are non-sensitive; localStorage is appropriate for them.

## Next Steps
→ Phases 7, 8, 9 fill their routes and reuse these primitives.
→ Phase 10 audits i18n completeness, contrast, and keyboard navigation.
