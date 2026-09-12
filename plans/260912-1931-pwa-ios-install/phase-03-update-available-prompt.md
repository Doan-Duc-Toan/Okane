# Phase 3: "Update available" prompt (`useRegisterSW`)

## Context Links
- Plan overview: [plan.md](plan.md)
- Depends on: [phase-02](phase-02-vite-plugin-pwa-manifest-and-service-worker.md) (`registerType: 'prompt'`, `injectRegister: null`)
- Conventions to copy: `apps/web/src/components/ui/error-state.tsx` (+ its `.module.css`), `apps/web/src/components/layout/app-shell.tsx`
- i18n: `apps/web/src/i18n/locales/{vi,ja}.json` — existing top-level keys: `common`, `theme`, `language`, `nav`, `login`, `register`, `field`, `currency`, `dashboard`, `goal`, `exchange`, `newGoal`, `smiles`, `apiError`
- Tests: `apps/web/src/test/setup.ts`, Vitest + Testing Library already configured

## Overview
- **Priority:** Required — Phase 2 is incomplete without it.
- **Status:** DONE
- **Effort:** 1h
- One small bar: "A new version is ready — Refresh". Tap it and the waiting worker takes over.

## Key Insights
- **Without this, an installed PWA can serve a build from weeks ago indefinitely.** Once a
  home-screen app is opened, the SW answers from cache; the new worker installs but sits in
  `waiting` until every client closes — and a home-screen app is rarely "closed". This component
  *is* the deploy mechanism for installed users.
- **This is the only new logic in the whole feature, so it is the only thing with a unit test.**
  Two branches worth proving: not-needing-refresh renders nothing, and clicking calls
  `updateServiceWorker(true)`.
- **Mock `virtual:pwa-register/react` in tests.** It is a Vite virtual module and does not exist
  under Vitest's module resolution; `vi.mock('virtual:pwa-register/react', ...)` — and the test file
  needs the mock hoisted, so declare the spy with `vi.hoisted`.
- **Ignore `offlineReady`.** `useRegisterSW` also returns an "app ready to work offline" toast
  signal. Nobody needs a popup congratulating them on caching. YAGNI — take `needRefresh` only.
- **Every string comes from the dictionary.** Hardcoded literals are a bug in this codebase (Phase 6
  rule, audited in Phase 10). Both `vi.json` and `ja.json` get the keys, or the JA build ships
  Vietnamese text.
- **Mount it in `AppShell`, but be aware `AppShell` is the *authenticated* layout.** A user sitting
  on `/login` will not see the prompt. Acceptable: login is a short-lived screen and a hard reload
  there is harmless. Do not restructure the router for this.

## Requirements
**Functional**
- Renders nothing until `needRefresh` is true.
- When true: a dismissible bar with the message and a refresh action.
- Refresh → `updateServiceWorker(true)` → the new worker activates and the page reloads.
- Dismiss → hides for the session; reappears on next load while the update is still waiting.
- VI + JA strings.

**Non-functional**
- Under 60 lines; CSS Module using existing tokens (no new colors).
- Does not shift layout or cover the nav — position it as a fixed bottom bar, above the iOS home
  indicator.
- Accessible: `role="status"`, real `<button>`s (reuse `Button`).

## Architecture
```
main.tsx / app-shell.tsx
        └─ <UpdatePrompt/>              (renders null in the common case)
               │
               └─ useRegisterSW({ onRegisteredSW?, immediate: true })
                      returns { needRefresh: [bool, setter], updateServiceWorker }
                                   │                              │
                        false → null                    click → updateServiceWorker(true)
                                                                 └→ skipWaiting + reload
```
- New i18n block, consistent with the existing shape:
  `update.available` ("Đã có phiên bản mới" / "新しいバージョンがあります"),
  `update.refresh` ("Tải lại" / "再読み込み"), `update.dismiss` (reuse `common.*` if a
  suitable dismiss/close key already exists — check before adding).

## Related Code Files
**Create:**
- `apps/web/src/components/ui/update-prompt.tsx`
- `apps/web/src/components/ui/update-prompt.module.css`
- `apps/web/src/components/ui/update-prompt.spec.tsx`

**Modify:**
- `apps/web/src/components/layout/app-shell.tsx` — mount `<UpdatePrompt/>` beside `<RateTicker/>`
- `apps/web/src/i18n/locales/vi.json`, `ja.json` — the `update` block

## Implementation Steps
1. Read `error-state.tsx` + `error-state.module.css` first and mirror their shape — `useTranslation`,
   named export, props interface above the component, `styles` import last.
2. Write `update-prompt.tsx`:
   ```tsx
   const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW()
   if (!needRefresh) return null
   ```
   plus the bar: message + `<Button onClick={() => updateServiceWorker(true)}>` and a ghost
   dismiss calling `setNeedRefresh(false)`.
3. CSS Module: `position: fixed; inset-inline: 0; bottom: 0;` with
   `padding-bottom: calc(0.75rem + env(safe-area-inset-bottom))` — that `env()` is the one place
   the iOS home indicator matters, since the bar is pinned to the very bottom.
   Colors from tokens (`--surface`, `--line`, `--ink`, `--shadow`); add no new token.
4. Add `update.available` / `update.refresh` to both locale files. Check `common` for an existing
   dismiss/close key before inventing one (DRY).
5. Mount in `app-shell.tsx`.
6. Write `update-prompt.spec.tsx` with a hoisted mock:
   - `needRefresh: [false, fn]` → `container` is empty.
   - `needRefresh: [true, fn]` → the message renders; clicking refresh calls
     `updateServiceWorker` with `true` exactly once.
   - clicking dismiss calls the setter with `false`.
7. `pnpm --filter web test` (existing tests must still pass), `lint`, `build`.
8. Real-worker check (not just the mock): `pnpm --filter web build && pnpm --filter web preview`,
   load the page, then in another terminal change a source string, rebuild, and reload the preview
   tab once → the bar appears → click Refresh → the new string is on screen.

## Todo List
- [x] `update-prompt.tsx` — under 60 lines, follows `error-state.tsx` conventions
- [x] CSS Module using existing tokens + `env(safe-area-inset-bottom)`
- [x] VI + JA strings added (no hardcoded literals)
- [x] Mounted in `AppShell`
- [x] Spec covers: hidden branch, refresh call with `true`, dismiss
- [x] `test` / `lint` / `build` green
- [x] Rebuild-while-open check done against a real service worker

## Success Criteria
- With no update pending, the DOM contains no trace of the component.
- Rebuilding while a preview tab is open surfaces the bar on the next load; Refresh loads the new
  build without a manual hard-reload or a cache clear.
- Switching to JA shows the Japanese string.
- The bar does not overlap content on a short viewport and sits above the iOS home indicator
  (re-checked on the device in Phase 4).
- Existing Vitest suite count grows only by the new tests; none regress.

## Risk Assessment
| Risk | Likelihood | Impact | Countermove |
|---|---|---|---|
| `virtual:pwa-register/react` unresolvable under Vitest → suite breaks | **High** if unmocked | Medium | `vi.hoisted` + `vi.mock` of the virtual module, written into step 6 |
| Prompt never fires because Phase 2 left `injectRegister` registering its own worker | Medium | Medium | Phase 2 sets `injectRegister: null`; step 8 proves the end-to-end path with a real worker |
| Prompt loops (reload → still waiting → prompt again) | Low | Medium | `updateServiceWorker(true)` handles skipWaiting + reload itself; do not hand-roll `location.reload()` alongside it |
| Bar covers the bottom of a form on a small iPhone | Medium | Low | Fixed bar is thin and dismissible; confirmed on-device in Phase 4 |
| Update prompt unreachable for users parked on `/login` | Low | Low | Accepted, stated above; not worth a router change |

**Rollback:** remove the component and its mount — a two-line revert. The SW from Phase 2 keeps
working; updates simply go back to needing a manual cache clear.

## Security Considerations
None new. No user input, no network call of its own, no storage. It triggers a page reload, so it
must never be rendered from remote-controlled data.

## Verification notes

Commit: 23122ed
- Component created at `apps/web/src/components/ui/update-prompt.tsx`, 58 lines, mirrors `error-state.tsx`
  conventions (named export, props interface, `useTranslation`, CSS Module import last).
- CSS Module uses existing tokens (`--surface`, `--line`, `--ink`, `--shadow`); fixed position with
  `env(safe-area-inset-bottom)` to clear iOS home indicator. No new tokens added.
- VI + JA strings added to both locale files: `update.available`, `update.refresh`. No hardcoded literals.
- Mounted in `AppShell` alongside `<RateTicker/>`.
- Unit test (`update-prompt.spec.tsx`) with hoisted mock of `virtual:pwa-register/react`: verifies
  hidden branch (needRefresh: false), refresh call with true, dismiss setter. All branches covered.
- `pnpm test` 27/27 passing. `pnpm lint` clean. `pnpm build` clean.
- Real worker validation: rebuilt while preview tab open → bar appeared on reload → Refresh loaded new
  build without manual hard-reload or cache clear. Japanese string confirmed on lang switch.

## Next Steps
→ Phase 4 verifies all three phases on a real iPhone.
