# Phase 4: Real-iPhone verification + docs

## Context Links
- Plan overview: [plan.md](plan.md)
- Depends on: [phase-01](phase-01-app-icons-png-generation.md), [phase-02](phase-02-vite-plugin-pwa-manifest-and-service-worker.md), [phase-03](phase-03-update-available-prompt.md)
- Files touched: `apps/web/vite.config.ts` (preview block), `docs/project-changelog.md`, `docs/development-roadmap.md`
- Precedent: Phase 10 of the MVP plan — the two items marked "reported but not independently re-verified" are exactly the failure mode this phase exists to avoid

## Overview
- **Priority:** This phase *is* the proof. Phases 1–3 are claims until it passes.
- **Status:** pending
- **Effort:** 1.5h
- Serve the production build over HTTPS to a physical iPhone, install it, and walk the checklist.

## Key Insights
- **Service workers require a secure context. A LAN IP over plain HTTP is not one.** The iPhone will
  happily install `http://192.168.x.x:4173` to the home screen and run it standalone — so the icon,
  splash, and no-Safari-chrome checks all pass — while `navigator.serviceWorker` is simply
  `undefined`, and offline plus the update prompt silently do nothing. Testing offline over LAN HTTP
  produces a false failure that looks like a code bug. **Use an HTTPS tunnel.**
- **`vite preview` rejects non-localhost `Host` headers.** A tunnel hostname gets
  "Blocked request. This host is not allowed." Needs `preview.allowedHosts`. This trips everyone
  once; budget zero minutes for it by setting it up front.
- **`preview` does not inherit `server.proxy`.** The existing config proxies `/api` under
  `server` only, so the preview build has no API. Add a `preview.proxy` block with the same target
  — otherwise the tunnel serves a UI that cannot log in, and everything past the login screen is
  untestable.
- **One tunnel origin covers both app and API.** Tunnel → `vite preview` → proxy → local Nest on
  :3000. Same-origin throughout, so no CORS work and no `VITE_API_URL` change.
- **The installed app has its own storage jar.** You will be logged out inside the home-screen app
  even if Safari is logged in — expected iOS behavior, not a session bug. Log in again there.
- **Airplane Mode is the honest offline test.** Turning off Wi-Fi alone can leave cellular serving
  the request; DevTools "offline" does not exist on the phone.
- **Reinstalling matters.** iOS caches the touch icon aggressively. If the icon looks wrong after a
  fix, remove the home-screen app, quit Safari entirely, and re-add — before concluding the icon
  is broken.
- **Simulator is a weak substitute.** The iOS Simulator's Safari has no "Add to Home Screen".
  Physical device or no verification.

## Requirements
**Functional**
- The production build reachable from the iPhone over HTTPS with a working `/api`.
- Every checklist item below observed firsthand and recorded.
- Docs updated with the outcome.

**Non-functional**
- Record what was actually observed, not what was expected — including anything skipped and why
  (house convention: see the MVP plan's `[~]` items).

## Architecture
```
iPhone (Safari, cellular or Wi-Fi)
   │ https://<random>.trycloudflare.com
   ▼
cloudflared quick tunnel  ──→  http://localhost:4173  (vite preview, dist/)
                                     │  /api/*  → proxy
                                     ▼
                               http://localhost:3000  (NestJS, docker Postgres)
```
Tunnel options, in order of preference:
1. `brew install cloudflared` → `cloudflared tunnel --url http://localhost:4173` (no account, prints an HTTPS URL).
2. `npx localtunnel --port 4173` (no install; slower, shows an interstitial on first visit).
3. `@vitejs/plugin-basic-ssl` — **last resort.** Self-signed certs make iOS service workers
   unreliable even after accepting the warning; it defeats the purpose of the test.

**Config additions to `apps/web/vite.config.ts`:**
```ts
preview: {
  host: true,                 // bind 0.0.0.0 so the tunnel can reach it
  allowedHosts: true,         // accept the tunnel's hostname
  proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: true } },
}
```

## Related Code Files
**Modify:**
- `apps/web/vite.config.ts` — the `preview` block above (dev-only ergonomics; `server.proxy` unchanged)
- `docs/project-changelog.md` — a PWA entry under a new dated heading
- `docs/development-roadmap.md` — backlog item 7 ("PWA / native mobile") marked done for the PWA half; native remains
- This file — fill in the verification notes

## Implementation Steps
1. Add the `preview` block to `vite.config.ts`.
2. Start the API (`docker` Postgres + `pnpm --filter api start:dev`), confirm `curl localhost:3000`.
3. `pnpm --filter web build && pnpm --filter web preview`.
4. Start the tunnel; open the HTTPS URL in **desktop** Safari/Chrome first to confirm the app and
   login both work through it before involving the phone.
5. On the iPhone, open the URL in **Safari** (not Chrome — iOS Chrome's "Add to Home Screen"
   behaves differently), log in, visit the dashboard and a goal detail page.
6. Share sheet → Add to Home Screen. Check the icon and name shown in the *add* dialog — that
   preview is itself the first signal about `apple-touch-icon` and `apple-mobile-web-app-title`.
7. Walk the checklist below, noting each result.
8. Update-prompt check: with the app open on the phone, change a visible string on the Mac,
   rebuild, relaunch the app on the phone → the bar appears → tap Refresh → the new string shows.
9. Write the results into the Todo List and "Verification notes" here. Anything not actually
   observed gets `[~]`, not `[x]`.
10. Update the changelog and roadmap. Commit.

### Device checklist
| # | Check | Pass condition |
|---|---|---|
| 1 | Home-screen icon | The indigo Okane mark — not a page screenshot, not a white square, not black-backed |
| 2 | App name under the icon | "Okane", not the page title or URL |
| 3 | Launch chrome | No address bar, no bottom toolbar |
| 4 | Splash | Brand background with the icon while booting; no white flash |
| 5 | Status bar | Legible against the page background in **both** light and dark mode |
| 6 | Safe areas | Nothing clipped by the notch/Dynamic Island or the home indicator; the update bar clears the indicator |
| 7 | Navigation | Every screen reachable and escapable using only in-app nav (standalone has no browser back button) |
| 8 | Auth | Login works inside the installed app; session survives a relaunch |
| 9 | Offline, cold | Airplane Mode → kill the app → relaunch → the shell renders (data may show the error state — that is correct) |
| 10 | Offline, warm | Airplane Mode while open → navigating to a visited route does not white-screen |
| 11 | Recovery | Airplane Mode off → data reloads without a manual restart |
| 12 | Update prompt | Per step 8 |
| 13 | Rotation | Landscape does not break the layout |
| 14 | Dark mode | System dark → app follows; theme toggle still persists across a relaunch |

## Todo List
- [ ] `preview` block added (host, allowedHosts, proxy)
- [ ] Tunnel up; app + login verified from desktop through the HTTPS URL first
- [ ] Installed to the iPhone home screen from Safari
- [ ] Checklist 1–7 (icon, name, chrome, splash, status bar, safe areas, nav)
- [ ] Checklist 8–11 (auth, offline cold/warm, recovery)
- [ ] Checklist 12–14 (update prompt, rotation, dark mode)
- [ ] Verification notes written below, with `[~]` for anything unproven
- [ ] `docs/project-changelog.md` + `docs/development-roadmap.md` updated
- [ ] Committed (conventional commit, no AI co-author trailer — repo convention)

**Verification notes (fill in on completion):** device + iOS version, tunnel used, and the
result of each numbered check. Note any check that was skipped and why.

## Success Criteria
All 14 checks pass on a physical iPhone, with #1, #3, #9, and #12 as the hard gates — icon,
standalone chrome, cold offline launch, and updatability. Anything else failing is a polish bug;
those four failing means the feature did not ship.

## Risk Assessment
| Risk | Likelihood | Impact | Countermove |
|---|---|---|---|
| Testing over LAN HTTP → SW never registers → offline "fails" and hours go into debugging correct code | **High** without this phase's warning | **High** | HTTPS tunnel mandated; the trap is stated in three places including `plan.md` |
| `vite preview` blocks the tunnel host | **High** | Low | `allowedHosts: true` added in step 1 |
| No `/api` under preview → nothing past login is testable | **High** | Medium | `preview.proxy` added in step 1; desktop smoke test in step 4 catches it before the phone |
| No physical iPhone available | Low | **High** | Blocks the phase outright — `tkm:takumi` must stop and ask rather than marking it verified. Simulator cannot substitute (no Add to Home Screen) |
| iOS caching a stale touch icon → icon looks broken after a real fix | Medium | Low | Remove the app, quit Safari, re-add before re-diagnosing |
| Passing the checklist by reading code instead of looking at the phone | Medium | **High** | `[~]` convention from the MVP plan; the notes must name the device and iOS version |
| Tunnel bandwidth/latency making the app feel slow | Medium | Low | Cosmetic to the tunnel, not the app; ignore |

**Rollback:** the only shipped change is the `preview` block, which affects no production output.
Revert it and everything from Phases 1–3 still stands.

## Security Considerations
- **The tunnel exposes a local dev API to the public internet for the duration of the test.**
  Rate limiting is still a backlog item (roadmap item 1) and there is no CSP yet. Keep the tunnel
  up only while testing, use throwaway credentials, and kill it immediately afterward.
- Never paste the tunnel URL anywhere persistent.
- The tunnel hostname is random and unguessable, but treat it as public regardless.
- `allowedHosts: true` belongs to `preview` only — do not copy it into `server`.

## Next Steps
→ Core feature complete. Phase 5 (push) is optional and unblocked from here.
