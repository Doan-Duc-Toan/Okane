# Phase 6: Deployment env vars, docs, production verification

## Context Links
- Plan overview: [plan.md](plan.md)
- Depends on: [phase-01](phase-01-google-cloud-console-setup.md) (the Client ID) **and**
  [phase-05](phase-05-tests-unit-and-e2e.md) (green)
- Docs to edit: `docs/deployment.md` (env var tables), `docs/development-roadmap.md` (backlog item 3),
  `docs/project-changelog.md`, `docs/system-architecture.md` (auth paragraph)
- Existing pattern to mirror: how `VITE_API_URL` and `CORS_ORIGINS` are documented today

## Overview
- **Priority:** the phase where the feature actually exists for a user.
- **Status:** pending
- **Effort:** 1h
- Two env vars, one `render.yaml` line, surgical doc edits, one real sign-in on production.

## Key Insights
- **Two env vars, same value, neither a secret.** `GOOGLE_CLIENT_ID` on Render (the `aud` to verify
  against) and `VITE_GOOGLE_CLIENT_ID` on Vercel (what the button announces). They **must** match —
  a mismatch means every token fails audience verification with a `401 googleTokenInvalid` that
  looks like a code bug. The Google **client secret** goes nowhere; if it ended up somewhere, delete
  it.
- **Vercel bakes `VITE_*` at build time.** Adding the variable is not enough — it needs a
  **redeploy**. `docs/deployment.md` already records this trap for `VITE_API_URL`; it applies
  identically here and is the most likely reason "I set it and nothing changed".
- **Render's build command already runs `prisma migrate deploy`**, so Phase 2's migration applies to
  Supabase automatically on the deploy that carries it. Nothing manual, but confirm it in the deploy
  log rather than assuming.
- **Deploy order matters.** API first, web second. API-first means the endpoint exists before any
  button can call it; web-first would give a live button pointed at a 404 for the length of the API
  build (plus a cold start).
- **CORS needs no change.** The browser calls Google directly and Okane's API from the Vercel origin
  that `CORS_ORIGINS` already allows. The redirect-free flow chosen in
  [phase-03](phase-03-backend-google-id-token-endpoint.md) is why this line is short.
- **The first production click will be slow.** Render free tier sleeps after ~15 min; budget 30–60 s
  and do not diagnose a hang before waking the API with any other request first.

## Requirements
**Functional**
- Render `okane-api` has `GOOGLE_CLIENT_ID` set; `render.yaml` declares it with `sync: false`.
- Vercel `okane-web` has `VITE_GOOGLE_CLIENT_ID` set for Production (and Preview, if you use
  previews), followed by a redeploy.
- A real Google sign-in completes on `https://okane-web.vercel.app`.
- Docs reflect reality.

**Non-functional**
- Doc edits are **surgical additions** to the existing tables/sections — not rewrites.
- No secret is committed; `render.yaml` carries the key name only, never a value.

## Architecture
```
Google Cloud "Okane Web" client
        │ Client ID (one value, public)
        ├─────────────→ Render  env  GOOGLE_CLIENT_ID        → verifyIdToken({ audience })
        └─────────────→ Vercel  env  VITE_GOOGLE_CLIENT_ID   → google.accounts.id.initialize({ client_id })
                                      (baked into the bundle at build time — redeploy required)
```

**`docs/deployment.md` — exact additions (nothing else in the file changes):**
- Under **Render (`okane-api`)**, one bullet after `CORS_ORIGINS`:
  > - `GOOGLE_CLIENT_ID` — the Google Cloud OAuth **Web application** Client ID
  >   (`….apps.googleusercontent.com`). Used only as the required `audience` when verifying Google ID
  >   tokens. Not a secret (it also ships in the web bundle), but it **must** be byte-identical to
  >   Vercel's `VITE_GOOGLE_CLIENT_ID` or every Google sign-in fails audience verification. No
  >   `GOOGLE_CLIENT_SECRET` is used — the ID-token flow doesn't need one. If unset, the API returns
  >   `503 googleNotConfigured` and the web app hides the Google button.
- Under **Vercel (`okane-web`)**, one bullet after `VITE_API_URL`:
  > - `VITE_GOOGLE_CLIENT_ID` — same value as Render's `GOOGLE_CLIENT_ID`. Baked into the JS bundle
  >   at build time, so changing it requires a redeploy, not just an env var update. Public by design.
  >   Left empty, the login page renders the Google button disabled ("coming soon") as it did before
  >   the feature shipped.
- Under **Known Limitations (free tier)**, append to the existing cold-start bullet: the first Google
  sign-in after the API sleeps inherits the same 30–60 s wake-up.

## Related Code Files
**Modify:**
- `render.yaml` — add `- key: GOOGLE_CLIENT_ID` / `sync: false` after the `CORS_ORIGINS` entry
- `docs/deployment.md` — the three additions above
- `docs/development-roadmap.md` — rewrite backlog item 3 as done, pointing at
  `plans/260913-2152-google-oauth-login/`
- `docs/project-changelog.md` — one dated entry: new login method, nullable `passwordHash` +
  `googleId`, verified-email linking rule, two new env vars
- `docs/system-architecture.md` — the auth paragraph gains Google as a second entry point; the
  "not yet" line at ~123 drops "Google OAuth"; note the future CSP must allowlist
  `https://accounts.google.com` (script/connect/frame)

**Dashboard-only (no file):** Render env var, Vercel env var.

## Implementation Steps
1. Confirm Phases 2–5 are committed and `main` is green.
2. `render.yaml`: add the `GOOGLE_CLIENT_ID` / `sync: false` entry. Commit — **but do not push yet**
   if you want to control ordering; pushing triggers both deploys.
3. **Render dashboard:** https://dashboard.render.com → `okane-api` → **Environment** →
   **Add Environment Variable** → key `GOOGLE_CLIENT_ID`, value = the full Client ID from
   [phase-01](phase-01-google-cloud-console-setup.md) → **Save Changes**. Render redeploys
   automatically; wait for **Live**.
4. In the Render deploy log, confirm `prisma migrate deploy` applied the `google_identity` migration
   (it should name it, or report nothing pending if a prior deploy already carried it).
5. Verify the API half before touching the frontend:
   ```
   curl -i -X POST https://okane-api-7v0o.onrender.com/api/auth/google \
     -H 'content-type: application/json' -d '{"credential":"not-a-token"}'
   ```
   Expect `401` `googleTokenInvalid`. A `503 googleNotConfigured` means step 3 didn't take; a `404`
   means the API hasn't deployed the code yet. (Allow for the cold-start wait.)
6. **Vercel dashboard:** https://vercel.com → `okane-web` → **Settings** → **Environment Variables**
   → **Add New**: key `VITE_GOOGLE_CLIENT_ID`, value = the same Client ID, environments
   **Production** (+ Preview/Development if you use them) → **Save**.
7. **Redeploy Vercel** — env vars alone do nothing to an already-built bundle: **Deployments** → the
   latest production deployment → **⋯** → **Redeploy**. Wait for Ready.
8. Real sign-in test on `https://okane-web.vercel.app` (use the plain production URL — the
   `-git-<branch>-` alias is login-protected *and* is not a registered JS origin):
   - a Google account **not** yet in Okane → new account, lands on the dashboard;
   - sign out, sign back in with the same Google account → same account, same goals;
   - a Google account whose email **already** exists as a password account → signs into that account,
     goals intact, and its password still works afterwards;
   - reload → still signed in (silent restore); logout → back to `/login`.
9. Repeat one sign-in with the UI in **JA** and once in **VI** — the button's own label follows
   `i18n.language`, and any error must render translated, never as a raw key.
10. Apply the doc edits. Commit and push (conventional, no AI co-author trailer).

## Todo List
- [ ] `render.yaml` declares `GOOGLE_CLIENT_ID` (`sync: false`, no value)
- [ ] Render env var set; service back to **Live**
- [ ] Deploy log shows the `google_identity` migration applied
- [ ] `curl` against production returns `401 googleTokenInvalid` (not 503, not 404)
- [ ] Vercel env var set for Production
- [ ] **Vercel redeployed** after setting it
- [ ] New-Google-account sign-in works on the production URL
- [ ] Returning sign-in resolves to the same account
- [ ] Email-match link verified: same account, goals intact, password still works
- [ ] Reload keeps the session; logout works
- [ ] VI and JA both checked, no raw i18n keys on screen
- [ ] Publishing status re-confirmed **In production** (no "unverified app" screen appeared)
- [ ] `docs/deployment.md` env tables + cold-start note updated
- [ ] `docs/development-roadmap.md` backlog item 3 closed
- [ ] `docs/project-changelog.md` entry added
- [ ] `docs/system-architecture.md` auth paragraph + CSP note updated
- [ ] Committed and pushed

## Success Criteria
A person with a Google account and no Okane password reaches the dashboard from
`https://okane-web.vercel.app` in one click-through, and an existing password user who clicks Google
lands in *their own* account rather than a fresh empty one. `docs/deployment.md`'s two env var lists
match what is actually set in the two dashboards — which is the only thing that makes the next
deployment reproducible.

## Risk Assessment
| Risk | Likelihood | Impact | Countermove |
|---|---|---|---|
| Vercel env var set but no redeploy → button still disabled, looks like the code failed | **High** | Medium | Step 7 is its own numbered step and its own checkbox |
| Render and Vercel values differ (truncated paste, wrong client) → 401 on every sign-in | Medium | **High** | Paste from one source; step 5's curl proves the API side independently |
| Client **secret** pasted into Render "for completeness" | Medium | Medium | Nothing reads it; delete it if present — an unused production secret is pure liability |
| Testing on the `-git-main-…vercel.app` alias → `origin_mismatch` + a login wall | Medium | Low | Step 8 names the correct URL and why |
| Migration didn't reach Supabase → 500s on every Google sign-in | Low | **High** | Step 4 verifies in the log before any browser test |
| Cold start read as a hang; someone "fixes" working code | Medium | Low | Called out in Key Insights and in the docs addendum |
| Doc tables drift from the dashboards over time | Medium | Medium | Edits are additive and live beside the existing entries, matching their format |

**Rollback (fastest first):**
1. **Unset `GOOGLE_CLIENT_ID` on Render** → endpoint 503s immediately, existing sessions and
   email/password login are untouched. No deploy needed beyond Render's own restart.
2. **Unset `VITE_GOOGLE_CLIENT_ID` on Vercel + redeploy** → the button reverts to disabled.
3. Revert Phases 4 then 3 by commit. **Leave Phase 2's migration in place** — already-linked accounts
   and Google-created users must keep working; re-imposing `NOT NULL` on `passwordHash` would fail
   anyway (see [phase-02](phase-02-prisma-schema-google-identity.md)).

## Security Considerations
- Both new variables are public values. The one real secret in this feature's Console setup — the
  client secret — is deliberately unused and must exist in no dashboard, no `.env`, and no commit.
- Verify with `git log -p --all -- render.yaml docs/deployment.md | grep -i "apps.googleusercontent\|secret"`
  that no actual value was ever committed; `render.yaml` should carry key names only.
- The endpoint is unauthenticated and does RSA verification per call — a plausible (if low-value)
  DoS surface. Login rate limiting (roadmap backlog item 1) should now be scoped to cover
  `/api/auth/google` alongside `/api/auth/login`; note that in the roadmap entry.
- Publishing the OAuth app "In production" means anyone with a Google account can create an Okane
  account — same exposure the public register form already has. If that ever becomes unwanted, the
  control is an allowlist in `AuthService`, not a Console toggle.

## Next Steps
→ Feature complete. Follow-ups, deliberately deferred: "set a password" for Google-only accounts,
Google account *unlinking*, and extending rate limiting over the new endpoint.
