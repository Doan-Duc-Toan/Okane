# Phase 10: Integration, QA & Hardening

## Context Links
- Plan overview: [plan.md](plan.md)
- Depends on: **all** prior phases (1–9)
- Approved mockup (parity reference): `https://claude.ai/code/artifact/12757e68-92ec-4463-b440-98f9241db3cc`

## Overview
- **Priority:** Blocking for "MVP done".
- **Status:** pending
- **Effort:** 2h
- Close the seams between the two tracks, run the full test matrix, walk the real user journeys,
  and complete the security and documentation checklist. No new features.

## Key Insights
- **The two tracks were built against frozen contracts, so the failures will cluster at the seams:**
  the dashboard's rate ticker, entry creation's dependence on `getLatestRate()`, and the Decimal→string
  serialization that every screen assumes. Check those three first, not the features.
- **The most valuable QA here is the empty-account journey.** Seed data hides every empty state, and
  a first-time user meets nothing else. Run the whole flow against a truly empty database.
- **This phase gates on "does the product tell the truth"** — stale rates labelled, daily alert
  cadence stated, thin history disclosed, deletion warned. A savings app that overstates its
  freshness loses users faster than one that ships a shallow chart.
- No new abstractions, no refactors. Anything discovered that is not a defect goes to the backlog.

## Requirements
**Functional**
- Every mockup screen reachable and behaviorally matching in both themes and both languages.
- All automated suites green.
- Full journeys pass on an empty database and on the seeded database.

**Non-functional**
- Keyboard-only operation of every interactive control; visible focus everywhere.
- Contrast on the token palette meets WCAG AA for body text in both themes.
- README lets a fresh clone reach a running app without asking a question.

## Test Matrix
| Layer | Tool | What it proves | Where written |
|---|---|---|---|
| Unit — API | Jest | Goal math (10 cases), FX converter, alert crossing, token service | Phases 3–5 |
| Unit — Web | Vitest + RTL | Money/rate/date formatting incl. a precision-breaking value | Phase 6 |
| e2e — API | Jest + supertest vs `okane_test` | Auth flow; **data isolation** (goals, entries, alerts); empty-table read paths | Phases 3–5 |
| Manual — journeys | Browser | The five journeys below, in both themes and both languages | **this phase** |
| Not in MVP | Playwright browser E2E, load testing, visual regression | — | backlog |

Coverage percentage is **not** a gate. The gate is that the expensive-to-be-wrong code is tested:
money math, FX math, and per-user data isolation.

## Journeys to walk (both themes, both languages)
1. **Cold start, empty DB** — register → empty dashboard → create a JPY goal → log an entry →
   see progress → create a VND goal with a deadline → log a **cross-currency** entry → verify the
   FX helper and suggested monthly → visit Exchange (near-empty chart) → set an alert → sign out.
2. **Returning user** — sign in → dashboard totals correct → open a goal → edit it (currency locked) →
   delete an entry → progress recalculates.
3. **Session lifecycle** — idle past the access TTL → click around → silent refresh, no interruption →
   sign out → back button cannot reach a protected screen.
4. **Degraded FX** — point `FX_API_URL` at an unreachable host, restart, empty the snapshot table →
   dashboard and goals still work; cross-currency logging returns the specific 503 message; the
   Exchange page shows its empty state; nothing 500s.
5. **Two users** — sign in as A in one browser and B in another; neither sees the other's goals,
   entries, or alerts; hand-crafting a URL with the other's goal ID yields a clean "not found" screen.

## Related Code Files
**Create:**
- `README.md` (root) — prerequisites, setup, scripts, troubleshooting
- `docs/system-architecture.md` — the two-app layout, module map, data flow, the FX-snapshot decision
- `docs/project-changelog.md` — the MVP entry
- `apps/api/test/jest-e2e.json` if not already produced by the scaffold

**Modify:**
- Any file with a defect found during QA (defect fixes only — no refactors)
- `plans/260910-1521-okane-react-nestjs-mvp/plan.md` — statuses to `completed`
- `docs/development-roadmap.md` — MVP milestone status

## Implementation Steps
1. **Seam check first:** dashboard ticker renders live data; entry creation converts via the real
   `ExchangeRateService`; every money field arrives as a string and renders formatted. Fix before QA.
2. Full suite: `pnpm -r test` and the API e2e against a freshly reset `okane_test`. Everything green
   before any manual work — a failing suite makes manual QA unreliable.
3. `pnpm build` in both workspaces; resolve every TypeScript error. No `@ts-ignore` added to pass.
4. Reset to an **empty** database (no seed) and walk journey 1 end to end. This is the highest-yield
   step in the phase.
5. Seed, then walk journeys 2, 3, and 5.
6. Walk journey 4 (degraded FX) — restore `FX_API_URL` afterward.
7. **i18n sweep:** switch to JA and visit every screen; any Vietnamese or English literal still
   visible is a missing dictionary key. Grep the `features/` tree for quoted user-facing strings as a
   second pass. Check JA text for clipping and overflow.
8. **Accessibility sweep:** tab through every screen (focus visible, order sensible, dialogs trap
   focus and close on Escape); labels bound to inputs; buttons are `<button>`; run Lighthouse
   accessibility on the dashboard and exchange pages and fix anything trivially fixable.
9. **Contrast check:** body text against `--color-bg` and `--color-surface` in both themes; confirm
   the vermilion alert text is legible on the dark paper background (`#e08a70` on `#12151c`) —
   verify with a contrast tool rather than by eye.
10. **Security checklist:**
    - [ ] No `.env` in git history (`git log --all --full-history -- '*.env'` empty)
    - [ ] No secret in any `VITE_*` variable
    - [ ] No `dangerouslySetInnerHTML` anywhere (grep)
    - [ ] Every cross-user access returns 404 (isolation suite green)
    - [ ] Access token absent from `localStorage`, from logs, and from URLs
    - [ ] Logout revokes server-side
    - [ ] No credential or full FX payload logged at info level
    - [ ] Global `ValidationPipe` whitelist active — a request with an unexpected field is rejected
11. **Responsive check** at 375px, 768px, and 1440px — the target user is often on a phone.
12. Write `README.md`: prerequisites (Node 24, Corepack/pnpm, Docker Desktop running),
    `pnpm install && pnpm db:up && pnpm db:reset && pnpm dev`, the script table, and the
    troubleshooting notes actually hit during the build (port 5432 in use, Docker not running,
    `psql` absent → use `docker compose exec db psql -U okane`).
13. Write `docs/system-architecture.md` and add the changelog entry; update the roadmap.
14. Record the backlog in plan.md, including anything QA surfaced that is not a defect.
15. Flip every phase's Status to `completed` in plan.md (`ck` is not installed — edit the table directly).

## Todo List
- [ ] Three seams verified (ticker, entry conversion, Decimal serialization)
- [ ] `pnpm -r test` green; API e2e green on a fresh `okane_test`
- [ ] `pnpm build` green in both workspaces, no new `@ts-ignore`
- [ ] Journey 1 on an **empty** database
- [ ] Journeys 2, 3, 5 on seeded data
- [ ] Journey 4 (FX degraded) — nothing 500s
- [ ] i18n sweep: no untranslated literal in JA; no clipped text
- [ ] Accessibility sweep: keyboard, focus, labels, Lighthouse
- [ ] Contrast verified in both themes
- [ ] Security checklist all boxes ticked
- [ ] Responsive at 375 / 768 / 1440
- [ ] README with setup + troubleshooting
- [ ] `docs/system-architecture.md`, changelog entry, roadmap updated
- [ ] plan.md statuses updated; backlog recorded

## Success Criteria
- A fresh clone reaches a working app with the README alone — verify by following it literally,
  including deleting `node_modules` first.
- All automated suites pass; the data-isolation suite passes with zero cross-user reads.
- Journey 1 completes on an empty database with a sensible screen at every step — no raw error,
  no blank panel, no "null".
- Journey 4 leaves the app fully usable for everything that does not strictly require a rate.
- Every screen matches the approved mockup in both themes and both languages.
- The security checklist is fully ticked.

## Risk Assessment
| Risk | Likelihood | Impact | Countermove |
|---|---|---|---|
| Seam defects between the parallel tracks | **High** | Medium | Step 1 targets exactly the three known seams before broader QA |
| Empty-state bugs hidden by seed data | **High** | Medium | Journey 1 runs on a genuinely empty database |
| QA turning into a refactor | Medium | Medium | Defect fixes only; everything else goes to the backlog list |
| Untranslated strings shipping | Medium | Low | Two-pass sweep: visual in JA, then grep for quoted literals |
| Contrast failures in dark mode with the warm palette | Medium | Medium | Measured with a tool in step 9; if a token genuinely fails AA, raise it with the user rather than silently changing an approved color |
| Scope creep into deployment | Medium | Medium | Deployment is explicitly out of scope for this plan — it is a separate follow-up |

**Rollback:** this phase produces defect fixes and documentation only; individual fixes revert
independently. Nothing here is structural.

## Security Considerations
The checklist in step 10 **is** this phase's security work. Two items are deliberately deferred and
must be recorded in the backlog rather than silently dropped:
- **Login rate limiting** (`@nestjs/throttler`, ~10 attempts/min/IP) — the first hardening item
  before any public exposure.
- **CSP + security headers** (`helmet`) — belongs with the deployment work, since the policy depends
  on the final origins and font sources.
Also record for launch time: `prisma migrate reset` stops being an acceptable rollback the moment
real user data exists (noted in Phase 2).

## Next Steps
MVP complete. Backlog, in the order it would most likely be picked up:
login rate limiting → deployment + CSP/helmet → Google OAuth → alert delivery (email) →
data export → recurring reminders → PWA/mobile.
