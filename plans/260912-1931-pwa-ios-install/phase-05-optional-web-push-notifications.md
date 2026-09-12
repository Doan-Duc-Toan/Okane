# Phase 5 (OPTIONAL): Web push notifications

> **Not required for delivery.** The core PWA ships complete at the end of Phase 4. This phase is a
> sketch of the shape of the work, deliberately not specified to implementation depth — writing a
> detailed plan for work that may never be picked up is waste. Re-plan it properly if and when it
> is wanted.

## Context Links
- Plan overview: [plan.md](plan.md)
- Depends on: [phase-04](phase-04-ios-device-verification.md) — iOS delivers push **only** to an
  installed home-screen PWA, so there is nothing to test until install works
- Related backlog: `docs/development-roadmap.md` item 4 (rate-alert delivery), item 2 (deployment)
- Existing trigger point: `apps/api/src/exchange-rate/rate-alert-evaluator.service.ts`, fired daily by `rate-snapshot.scheduler.ts`

## Overview
- **Priority:** P3, severable.
- **Status:** pending (optional)
- **Effort:** ~5h, plus real device iteration
- Deliver the existing rate-alert crossings as an actual iPhone notification instead of an in-app
  state change.

## Key Insights
- **This is the only part of the whole plan that touches `apps/api`.** The roadmap's claim that PWA
  work needs no backend change holds for Phases 1–4 and breaks here — say so plainly rather than
  pretending otherwise.
- **iOS constraints are severe and non-negotiable:** iOS 16.4+, the app must already be installed to
  the home screen, and permission may only be requested from a **user gesture** inside the installed
  app. A permission prompt on page load is auto-denied — and once denied, iOS gives no easy path
  back; the user must delete and reinstall the app. So the request must be a deliberate button in
  settings, never automatic.
- **VAPID keys are secrets and infrastructure.** The private key is a new env var with fail-fast
  validation (matching the existing env-validation convention). The public key reaches the client —
  and per the Phase 6 rule, `VITE_*` variables are public, which the VAPID *public* key legitimately
  is. The private key must never be `VITE_*`-prefixed.
- **Push needs a stable HTTPS origin**, i.e. deployment (roadmap item 2) first. Tunnel URLs rotate,
  and a rotated origin invalidates every stored subscription.
- **Subscriptions expire and go stale constantly.** A `410 Gone` from the push service means delete
  the row. Without that, the table fills with dead endpoints and every send burns requests failing.
- **`generateSW` cannot host a `push` handler** — a push listener is custom SW code. This forces
  Phase 2's `generateSW` to become `injectManifest` with a hand-written `sw.ts`. That is the real
  cost of this phase, and the reason it is severable rather than "just one more endpoint".

## Requirements (sketch)
**Backend (`apps/api`)**
- `web-push` dependency; VAPID keypair generated once, stored in env, validated at boot.
- Prisma model `PushSubscription` (userId, endpoint unique, p256dh, auth, createdAt), user-scoped
  exactly like every other owned model, with the same isolation test posture (cross-user access → 404).
- `POST /api/push/subscribe`, `DELETE /api/push/unsubscribe`, both authenticated.
- `GET /api/push/public-key` (or serve it via a `VITE_` build var — decide at implementation time).
- Send path hooked into `RateAlertEvaluatorService` where an alert currently only changes state.
- `410`/`404` from the push service → delete the subscription row.

**Frontend (`apps/web`)**
- Phase 2 switches `generateSW` → `injectManifest`, adding `src/sw.ts` with `push` and
  `notificationclick` handlers plus the existing precache logic.
- A settings toggle: "Notify me when the rate crosses my alert" — subscribe on a real click,
  unsubscribe on toggle-off.
- Show *why* it is unavailable rather than hiding it: not installed / iOS too old / permission denied.
- VI + JA strings, including the notification body itself.

## Architecture (sketch)
```
installed PWA ── user taps "Enable notifications" (real gesture, required by iOS)
     └─ Notification.requestPermission() → granted
          └─ registration.pushManager.subscribe({ applicationServerKey: VAPID_PUBLIC })
               └─ POST /api/push/subscribe  { endpoint, keys }  → PushSubscription row

daily cron (01:00 UTC) → RateAlertEvaluatorService → alert crosses
     └─ web-push.sendNotification(sub, payload) per subscription
          ├─ 201 → done
          └─ 404/410 → delete the row
                 │
   iOS APNs ─────┴──→ sw.ts 'push' → showNotification → 'notificationclick' → focus/open /exchange
```

## Related Code Files (anticipated)
**Create:** `apps/api/src/push/*` (module, controller, service), a Prisma migration,
`apps/web/src/sw.ts`, a settings toggle component + its spec.
**Modify:** `apps/api/prisma/schema.prisma`, `app.module.ts` (one import — the append-only
convention from the MVP plan), `rate-alert-evaluator.service.ts`, env validation,
`apps/web/vite.config.ts` (`injectManifest`), `.env.example`.

## Todo List
- [ ] Decide whether push is wanted at all (it may not be — the in-app alert may suffice)
- [ ] Deployment + stable HTTPS origin exists (roadmap item 2)
- [ ] Re-plan this phase at implementation depth before starting

## Success Criteria
With the app installed on an iPhone and notifications enabled, a rate crossing produces a real iOS
notification while the app is closed, and tapping it opens the exchange screen. Revoking the toggle
stops delivery and removes the row.

## Risk Assessment
| Risk | Likelihood | Impact | Countermove |
|---|---|---|---|
| `injectManifest` migration breaks the working Phase 2 SW | Medium | **High** | Do it as its own commit with the Phase 4 checklist re-run before any push work; keep `selfDestroying` as the escape hatch |
| Permission auto-denied by prompting without a gesture — unrecoverable without reinstall | **High** if careless | **High** | Permission only ever inside a click handler; never on mount |
| iOS silently dropping notifications (known flakiness across iOS 16.4–17 point releases) | Medium | Medium | Accept; do not chase. In-app alert state remains the source of truth, push is best-effort |
| VAPID private key committed | Low | **High** | Env var + fail-fast validation + `.env.example` placeholder only; never `VITE_`-prefixed |
| Dead subscriptions accumulating | **High** over time | Low | Delete on 404/410 — specified above, easy to forget |
| Scope creep: push for goal reminders, entry nudges, etc. | Medium | Medium | This phase covers rate alerts only; anything else is a separate plan |

**Rollback:** drop the `push` module and the table; revert the SW to `generateSW`. Note that
already-issued subscriptions simply stop receiving — no client-side cleanup needed.

## Security Considerations
- VAPID private key: env only, fail-fast validated, never logged.
- Subscription endpoints are per-user secrets — scoped by `userId` on every query, same isolation
  posture as goals and entries, with the same e2e test.
- Never put amounts, balances, or goal names in a notification payload: lock-screen previews are
  visible to anyone holding the phone. Keep the body generic ("the JPY/VND rate crossed your alert")
  and put the detail behind the tap.
- `POST /subscribe` must validate the payload shape and cap subscriptions per user — an
  unvalidated endpoint is an open relay into the push service on your VAPID identity.

## Next Steps
Only after core PWA + deployment. Re-plan properly at that point.
