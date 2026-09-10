# Phase 7: QA & Deploy

## Context Links
- Plan overview: [plan.md](plan.md)
- Depends on: all prior phases (01-06)

## Overview
- Priority: Blocking (release gate)
- Status: pending
- Final manual QA pass + production deploy confirmation. No new features here.

## Key Insights
- MVP scope is small enough that manual QA checklist is sufficient — full automated
  test suite is not warranted yet (YAGNI); revisit once phase 2/3 features land.

## Requirements
- Functional: full signup → goal → entry → dashboard flow works end-to-end in production
- Non-functional: no exposed secrets in responses/logs, `APP_DEBUG=false` in production

## Architecture
N/A — this phase is verification, not new architecture.

## Related Code Files
**Read (no changes expected unless bugs found):** all files from Phases 1-6

## Implementation Steps
1. Manual QA checklist (run against production Railway URL):
   - Sign up with email → confirm session persists on reload
   - Sign in with Google → confirm session persists on reload
   - Log out → confirm redirected away from protected pages
   - Create a goal (JPY) and a goal (VND) → both appear in list
   - Edit a goal → changes persist
   - Log 2-3 entries against a goal → totals update correctly
   - Delete an entry → total updates correctly
   - Delete a goal → its entries are gone too (cascade), no orphan errors
   - Dashboard shows correct grand total + per-goal progress %
   - Log in as a second test account → confirm it cannot see the first account's goals/entries (try guessing a goal URL/ID directly too)
2. Confirm `.env` on Railway has `APP_DEBUG=false` and `APP_ENV=production` (no stack traces leaking to users)
3. Fix any bugs found, re-run the specific failed checklist item
4. Confirm production Railway deploy is on the latest commit

## Todo List
- [ ] Full manual QA checklist run (all items above)
- [ ] Cross-user data isolation manually verified (two accounts)
- [ ] `APP_DEBUG=false` confirmed in production
- [ ] Production deploy confirmed on latest commit

## Success Criteria
- Every checklist item passes on the production URL, not just localhost

## Risk Assessment
- Risk: the app-layer isolation scope (no DB-level RLS) has a gap only multi-user testing reveals → Mitigation: explicitly test with two separate accounts before calling MVP done — this is the highest-risk area given the Laravel stack switch

## Security Considerations
- This phase is the last line of defense for data isolation — do not skip the cross-user test even under time pressure
- `APP_DEBUG=false` in production prevents leaking stack traces/env values on errors

## Next Steps
- MVP is done. Backlog (phase 2/3 features) tracked in plan.md "out of scope" section
  and the original brainstorm report for future planning.
