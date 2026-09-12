# Phase 2: `vite-plugin-pwa` — manifest, service worker, `index.html` head

## Context Links
- Plan overview: [plan.md](plan.md)
- Depends on: [phase-01](phase-01-app-icons-png-generation.md) — the PNGs must exist on disk
- Consumed by: [phase-03](phase-03-update-available-prompt.md) (`virtual:pwa-register/react`)
- Files: `apps/web/vite.config.ts`, `apps/web/index.html`, `apps/web/tsconfig.app.json`
- Tokens: `--ai #1f3a5f` (light), `--paper #f7f4ec` (light) / `#12151c` (dark) — `apps/web/src/styles/tokens.css`

## Overview
- **Priority:** The core of the feature.
- **Status:** DONE
- **Effort:** 1.5h
- Install and configure the plugin, declare the manifest inline in `vite.config.ts`, add the
  iOS-specific `<head>` tags, and keep the service worker away from `/api`.

## Key Insights
- **`vite-plugin-pwa@1.3.0` accepts `vite: ^8.0.0`** — verified against the registry today, which
  is the one compatibility question worth asking on Vite 8.2.2. `workbox-build` / `workbox-window`
  are listed as *both* dependencies and peers, so pnpm satisfies them itself; if it still warns
  about an unmet peer, add `workbox-window` to `devDependencies` and move on.
- **The manifest lives in `vite.config.ts`, not a checked-in `public/manifest.json`.** Two sources
  of truth for icon paths is how a manifest silently starts 404ing after a rename.
- **iOS reads `<link rel="apple-touch-icon">`, not the manifest icons array.** Both must be
  present, pointing at the same artwork. Manifest-only is the classic "why is my home screen icon a
  blurry page screenshot" bug.
- **`display: "standalone"` alone is no longer enough on older iOS; the explicit
  `apple-mobile-web-app-capable` meta is still the reliable path.** Keep both. Ship
  `mobile-web-app-capable` too — it is the standards-track spelling and silences the Chrome warning.
- **`apple-mobile-web-app-status-bar-style` must be `default`, not `black-translucent`.**
  Translucent pushes content under the status bar, which would require `viewport-fit=cover` plus
  `env(safe-area-inset-*)` padding across a nav bar that was *just* reworked for mobile (see recent
  commits). Not worth reopening for a cosmetic gain.
- **`theme-color` needs two media-scoped tags.** The app has a light/dark toggle; a single
  hard-coded `theme-color` guarantees a mismatched band above the content in one of the two modes.
- **`navigateFallbackDenylist` must exclude `/api`.** Workbox's default navigate fallback serves
  precached `index.html` for any navigation request; without the denylist, an API route opened
  directly (or a redirect through one) gets HTML back. The SW must not touch `/api` at all —
  no runtime cache, no fallback.
- **The pre-paint theme script in `index.html` is load-bearing and fragile.** It exists to prevent a
  dark-mode flash and mirrors `src/contexts/theme-context.tsx`. Add new tags *around* it; do not
  reorder, reformat, or "tidy" it, and do not insert anything between it and `</head>` that could
  delay it.
- **`registerType: 'prompt'` intentionally leaves new content sitting in the waiting state.** That
  is a half-feature until Phase 3 ships the prompt; the two phases are one deliverable split for
  reviewability.

## Requirements
**Functional**
- Manifest: `name: "Okane"`, `short_name: "Okane"`, `start_url: "/"`, `scope: "/"`,
  `display: "standalone"`, `theme_color: "#1f3a5f"`, `background_color: "#f7f4ec"`,
  `lang: "vi"`, `icons`: the four Phase 1 files with a `maskable` entry.
- SW precaches built JS/CSS/HTML + `favicon.svg` + the icons.
- Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`) runtime-cached so the offline shell
  keeps its typography instead of falling back to system faces mid-Vietnamese-diacritic.
- `/api/**` never cached and never navigate-fallbacked.
- `index.html` gains: manifest link, `apple-touch-icon`, `apple-mobile-web-app-capable`,
  `mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-mobile-web-app-title`,
  two `theme-color` tags, and a `description`.

**Non-functional**
- `pnpm --filter web build` and `tsc -b` pass; `pnpm --filter web test` and `lint` stay green.
- `pnpm --filter web dev` behavior unchanged (`devOptions.enabled` stays **off** — a SW in dev
  fights HMR and caches modules you are editing).
- `apps/api` untouched.

## Architecture
```
vite.config.ts
  plugins: [react(), VitePWA({ ... })]
                      │
     build ───────────┼──→ dist/manifest.webmanifest   (from the inline `manifest` object)
                      ├──→ dist/sw.js                  (Workbox generateSW + precache list)
                      └──→ dist/registerSW.js          (unused: injectRegister:null, Phase 3 registers)

runtime request routing inside sw.js
  navigation (/, /goals/1, …) → precached index.html   [denylist: ^/api]
  /assets/*.js|css            → precache, cache-first
  fonts.googleapis.com        → StaleWhileRevalidate  "google-fonts-stylesheets"
  fonts.gstatic.com           → CacheFirst, 1y, 20 entries "google-fonts-webfonts"
  /api/**                     → (no route) → straight to network, always
```

**`VitePWA` options (the shape, not a transcription to paste blind):**
```ts
VitePWA({
  registerType: 'prompt',
  injectRegister: null,              // Phase 3's useRegisterSW does the registering
  includeAssets: ['favicon.svg', 'icons/*.png'],
  manifest: { /* per Requirements */ },
  workbox: {
    globPatterns: ['**/*.{js,css,html,svg,woff2}'],
    navigateFallback: 'index.html',
    navigateFallbackDenylist: [/^\/api/],
    runtimeCaching: [ /* the two Google Fonts rules above */ ],
    cleanupOutdatedCaches: true,
  },
  devOptions: { enabled: false },
})
```

**`index.html` head — placement matters:**
```
<meta charset> … <link icon favicon.svg> … <meta viewport> … <title>      ← unchanged
+ <meta name="description">
+ <link rel="manifest" href="/manifest.webmanifest">
+ <link rel="apple-touch-icon" href="/icons/apple-touch-icon-180.png">
+ <meta name="apple-mobile-web-app-capable" content="yes">
+ <meta name="mobile-web-app-capable" content="yes">
+ <meta name="apple-mobile-web-app-status-bar-style" content="default">
+ <meta name="apple-mobile-web-app-title" content="Okane">
+ <meta name="theme-color" media="(prefers-color-scheme: light)" content="#f7f4ec">
+ <meta name="theme-color" media="(prefers-color-scheme: dark)"  content="#12151c">
  <link rel="preconnect" …> <link href="…fonts.googleapis.com…" rel="stylesheet">  ← unchanged
  <script> /* pre-paint theme resolution */ </script>                              ← UNCHANGED, stays last
```
`theme-color` is the *chrome band* color, so it tracks `--paper` (the page background), not `--ai`.
The manifest's `theme_color` stays `--ai` — that one colors the install/task-switcher affordance.

## Related Code Files
**Modify:**
- `apps/web/vite.config.ts` — import + `VitePWA({...})` in `plugins`
- `apps/web/index.html` — head tags above
- `apps/web/tsconfig.app.json` — `"types": ["vite/client", "vite-plugin-pwa/react"]` so
  `virtual:pwa-register/react` type-checks in Phase 3
- `apps/web/package.json` — one devDependency

**Create:** none (the manifest and SW are build outputs).

## Implementation Steps
1. `pnpm --filter web add -D vite-plugin-pwa`. If pnpm reports an unmet `workbox-window` peer,
   add it `-D` as well. Confirm `apps/api` and the root lockfile entries for it are untouched.
2. Add the plugin to `vite.config.ts` per the options block. Keep `react()` first.
3. Fill the `manifest` object; icon `src` values must match Phase 1's filenames exactly —
   `/icons/icon-192.png` etc., with `type: "image/png"` and `sizes` on every entry, and
   `purpose: "maskable"` only on `maskable-512.png`.
4. Add the two Google Fonts `runtimeCaching` rules (`CacheFirst` for `gstatic`, with
   `cacheableResponse: { statuses: [0, 200] }` — font responses are opaque cross-origin, and
   without status `0` Workbox refuses to store them).
5. Edit `index.html`: insert the new tags exactly where the Architecture block shows. Re-read the
   file afterward and confirm the pre-paint script is byte-identical and still the last child.
6. Add `vite-plugin-pwa/react` to `tsconfig.app.json` `types`.
7. `pnpm --filter web build`. Inspect `dist/`: `manifest.webmanifest` present with the four icons,
   `sw.js` present, the precache list contains the JS/CSS/HTML **and no `/api` entry**.
8. `pnpm --filter web preview`, open `http://localhost:4173` in Chrome: Application → Manifest shows
   name/icons with no errors; Application → Service Workers shows one activated worker.
   DevTools → Network with "Offline" checked → reload → the shell still renders.
9. Log in, watch the Network tab: `/api/*` requests must show as network requests, never
   "(from ServiceWorker)" cache hits.
10. `pnpm --filter web test` and `lint` — both green, unchanged.

## Todo List
- [x] `vite-plugin-pwa` added to `apps/web` devDeps only
- [x] `VitePWA` configured: prompt, `injectRegister: null`, manifest, workbox options
- [x] Manifest icon paths match Phase 1 filenames exactly; maskable entry present
- [x] Google Fonts runtime caching with `statuses: [0, 200]`
- [x] `index.html` head tags added; pre-paint theme script verified untouched and still last
- [x] `tsconfig.app.json` types updated
- [x] Build output inspected: manifest + sw.js, no `/api` in precache
- [x] Chrome: manifest clean, SW activated, offline reload renders, `/api` bypasses the SW
- [x] `test` + `lint` green

## Success Criteria
- Chrome DevTools → Application → Manifest: zero errors/warnings, all four icons resolve (no 404s).
- One activated service worker at `/sw.js`; the precache manifest lists the hashed build assets and
  nothing under `/api`.
- Offline reload of `/` renders the app shell with the correct fonts (proves the font runtime cache).
- An authenticated `/api/goals` call is served from the network, not the SW, on every load.
- `git diff apps/api` is empty.
- Dark-mode reload still shows **no white flash** — the Phase 6 guarantee survives the head edits.

## Risk Assessment
| Risk | Likelihood | Impact | Countermove |
|---|---|---|---|
| SW caches an API response → stale balances, or a logged-out user seeing another session's data | Low | **High** | No `/api` runtime rule at all + `navigateFallbackDenylist` + the explicit Network-tab check in step 9 |
| Head edits disturb the pre-paint theme script → dark-mode flash returns | Medium | Medium | Insert above the font tags only; script stays last; flash re-checked in Success Criteria |
| Icon path typo → blank iOS icon, discovered only on the device | Medium | Medium | DevTools Manifest panel resolves every icon in step 8, before Phase 4 |
| Opaque font responses silently not cached → offline shell loses Vietnamese/Japanese faces | Medium | Low | `cacheableResponse.statuses: [0, 200]`; verified by the offline reload check |
| Stale SW pins an old build with no way to update | Low | **High** | Phase 3's prompt is the answer; escape hatch: `VitePWA({ selfDestroying: true })` ships a worker that unregisters itself |
| Vite 8 / plugin incompatibility | Low | Medium | Peer range already verified (`vite: ^8.0.0`); a build failure surfaces in step 7, before any device work |

**Rollback:** revert the commit, then **ship one build with `selfDestroying: true`** before removing
the plugin entirely. Deleting the plugin outright leaves already-installed workers alive on every
device that visited — a service worker outlives the code that registered it. Losing the plugin
without that intermediate build is the one irreversible mistake in this plan.

## Security Considerations
- The SW is same-origin and precaches only build output — no user data enters the cache.
- Never precache or runtime-cache an authenticated response; a shared device could replay it from
  the cache after logout. This is *why* `/api` has no rule, not merely a freshness concern.
- Scope stays `/` — the SW controls only this origin.
- When deployment lands (roadmap item 2), the CSP must allow `worker-src 'self'`, and
  `sw.js` must be served with `Cache-Control: no-cache` or a stale worker pins itself.

## Verification notes

Commit: e862860 (main implementation) + c834450 (follow-up fix per code review)
- Plugin installed, `VitePWA` configured with `registerType: 'prompt'`, `injectRegister: null`.
- Manifest generated with all four Phase 1 icons, correct maskable entry. Paths verified exact.
- `index.html` head tags added (manifest link, apple-touch-icon, capability metas, two theme-color
  tags per light/dark scheme). Pre-paint theme script verified byte-identical and still last child.
- `tsconfig.app.json` types updated for `virtual:pwa-register/react`.
- Build verified: `dist/manifest.webmanifest` clean (all icons 200 OK in DevTools), `dist/sw.js` present,
  precache list contains build assets only — zero `/api` entries. Unused template SVG excluded from
  precache per reviewer note (commit c834450).
- Chrome DevTools: one activated service worker at `/sw.js`, offline reload of `/` renders app shell with
  correct Google Fonts caching. Network tab confirms `/api/*` requests hit the network, never cached.
- `pnpm test` 27/27 passing. `pnpm lint` clean. Dark-mode reload produces zero white flash (Phase 6
  guarantee preserved).

## Next Steps
→ Phase 3 registers the worker and surfaces the waiting update.
