---
title: "Okane PWA — installable to the iPhone home screen"
description: "Make apps/web installable from Safari: manifest, icons, standalone mode, offline app shell, update prompt. No App Store, no backend change."
status: pending
work_type: feature
priority: P2
effort: 5h
branch: main
tags: [pwa, ios, vite, service-worker, offline]
created: 2026-09-12
blockedBy: []
blocks: []
---

# Plan: Okane as an installable iOS PWA

## Overview
Turn `apps/web` into something you add to the iPhone home screen from Safari and it behaves like an
app: own icon, own splash, no Safari chrome, and it opens offline instead of showing the dinosaur.

Closes roadmap backlog item 7 (`docs/development-roadmap.md`) — which already notes the API was
built decoupled so this needs **no** `apps/api` change. That holds: Phases 1–4 are frontend-only.
Web push (Phase 5) is the one piece that needs backend, and it is explicitly optional.

**Not in scope:** App Store / Capacitor / React Native, Android-specific install UX,
background sync, offline *writes* (queueing entries made while offline — the SW caches the
shell only; mutations still need the network and will surface the existing `ErrorState`).

## Phases

| # | Phase | Status | Effort | File |
|---|-------|--------|--------|------|
| 1 | App icons — PNG generation from a brand mark | DONE | 1h | [phase-01-app-icons-png-generation.md](phase-01-app-icons-png-generation.md) |
| 2 | `vite-plugin-pwa`: manifest, service worker, `index.html` head | DONE | 1.5h | [phase-02-vite-plugin-pwa-manifest-and-service-worker.md](phase-02-vite-plugin-pwa-manifest-and-service-worker.md) |
| 3 | "Update available" prompt (`useRegisterSW`) | DONE | 1h | [phase-03-update-available-prompt.md](phase-03-update-available-prompt.md) |
| 4 | Real-iPhone verification + docs | pending | 1.5h | [phase-04-ios-device-verification.md](phase-04-ios-device-verification.md) |
| 5 | **Optional, not required for delivery** — web push notifications | pending | 5h | [phase-05-optional-web-push-notifications.md](phase-05-optional-web-push-notifications.md) |

## Key dependencies

```
1 (icons) ──┐
            ├─→ 2 (plugin + manifest + head) ──→ 3 (update prompt) ──→ 4 (device verification)
            ┘                                                              │
                                                          (core done) ─────┴──→ 5 (optional push)
```
- Phase 2 needs Phase 1's real PNG files on disk — the manifest and `apple-touch-icon` reference
  them by path, and a 404 icon is the single most common reason an iOS install shows a blank
  screenshot-glyph instead of the app icon.
- Phase 3 needs Phase 2's `virtual:pwa-register/react` module to exist.
- Phase 4 is the only phase that proves anything; 1–3 are unverified until it runs.
- **Phase 5 is severable.** Core is shippable and complete at the end of Phase 4.

## Decisions already made (don't re-litigate)
- **`vite-plugin-pwa` 1.3.0**, `generateSW` (Workbox) mode. Peer range verified today: it accepts
  `vite: ^8.0.0`, which matters — this repo is on Vite 8.2.2. `injectManifest` (hand-written SW)
  buys nothing here; there is no custom fetch logic to write.
- **`registerType: 'prompt'`**, not `autoUpdate`. A silently self-updating SW mid-session swaps
  JS chunks under a running React tree. Hence Phase 3.
- **No `sharp`, no `@vite-pwa/assets-generator`** (optional peer, pulls `sharp`). Icons are made
  once by a throwaway `puppeteer-core` script driving the Chrome already installed on this machine,
  then committed as plain PNGs. Nothing new lands in `package.json`.
- **API responses are never cached.** Precache covers built JS/CSS/HTML only; Google Fonts get one
  runtime-cache rule; everything else, `/api/**` first among them, falls through to the network.
- **No hand-rolled `apple-touch-startup-image` set.** iOS 15+ composes a splash from the icon +
  `background_color` + name. Per-device splash PNGs are ~20 files to maintain for a solo side
  project; revisit only if Phase 4 shows the generated splash is actually unacceptable.

## Testing posture
Config files (manifest, `vite.config.ts`, `index.html` head) get **no unit tests** — a test that
asserts a literal equals itself proves nothing. The one piece with branching logic, the update
prompt, gets a Vitest test with `virtual:pwa-register/react` mocked (Phase 3).

The real gate is Phase 4's **manual pass on a physical iPhone**. Safari devtools cannot emulate
"Add to Home Screen", and Chrome's PWA audit certifies nothing about iOS behavior.

## Success criteria (core done)
Add to Home Screen from Safari on an iPhone → the Okane mark appears on the home screen (not a
page screenshot) → tapping it opens full-screen with no address bar and no bottom toolbar → a
brand-colored splash shows while it boots → after visiting the dashboard once, killing the app and
reopening it in Airplane Mode still renders the shell instead of Safari's offline error → after a
rebuild, the running app offers "update available" instead of silently serving stale JS.

## Known trap, resolved in Phase 4
Service workers require a **secure context**. An iPhone hitting `http://192.168.x.x:4173` over the
LAN will install to the home screen and run standalone, but will **silently never register the
SW** — so offline and the update prompt look broken while actually being fine. Phase 4 therefore
tests through an HTTPS tunnel, not a bare LAN IP.

## Status

**Phases 1–3 complete.** All commits tested and verified; automated test suite + puppeteer-core validation confirms icon generation, manifest/SW build, and update prompt wiring are correct. Code review passed with zero critical/high/medium findings. Phase 1–3 functionality exhaustively verified through unit tests, linting, build artifacts, and real service worker lifecycle validation against a `vite preview` build.

Phase 4 pending device testing; Phase 5 remains optional per plan scope.

## Next steps
Phases 1–3 automated verification complete. Phase 4 requires physical iPhone hands-on testing. After Phase 4: log it in `docs/project-changelog.md` and tick backlog item 7 in `docs/development-roadmap.md`. Phase 5 (push) stays on the backlog until wanted — it is the natural partner to backlog item 4 (rate-alert delivery), and worth doing only once a real host exists (backlog item 2), since push needs a stable HTTPS origin.
