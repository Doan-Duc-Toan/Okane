# Phase 1: Google Cloud Console setup — **manual, user-only**

## Context Links
- Plan overview: [plan.md](plan.md)
- Consumes: nothing. **Blocks nothing in code** — Phases 2–5 are written and tested against a faked
  verifier with no real credentials.
- Blocks: [phase-06](phase-06-deployment-env-and-docs.md) (production verification) and any real
  browser sign-in.
- Produces: one value — the **OAuth 2.0 Client ID**, a string ending in
  `.apps.googleusercontent.com`.

## Overview
- **Priority:** do it first or do it last; it is off the code critical path, but nothing is
  *verifiable* without it.
- **Status:** pending
- **Effort:** 0.5h (mostly reading consent-screen forms)
- **No agent can do this.** It needs a signed-in Google account and dashboard clicks. Every step
  below names the exact button.

## Key Insights
- **Google renamed this area.** The single "OAuth consent screen" page is gone. It is now
  **Google Auth Platform**, split across tabs: **Overview**, **Branding**, **Audience**,
  **Clients**, **Data Access**, **Verification Center**. Old tutorials will not match what you see.
- **Publish to "In production" immediately.** Okane asks for `openid email profile` only — all
  **non-sensitive** scopes, which need **no Google verification review** to publish. Staying in
  "Testing" costs you: a 100-test-user cap, every signer-in must be added by hand as a test user
  first, and everyone sees an "unverified app" interstitial. Publishing removes all three, instantly,
  with no review queue. (The widely-cited "7-day token expiry" of Testing mode applies to Google
  *refresh* tokens, which this flow never requests — irrelevant here, but the other three reasons
  stand.)
- **This flow needs Authorized JavaScript origins, and no Authorized redirect URIs.** Google's
  button hands the ID token to JavaScript in the page; the browser never leaves the site and Google
  never redirects anywhere. Consequently there is **no `.../auth/google/callback` URL on the Render
  API to register** — that path only exists in the server-side Authorization Code design this plan
  rejected (see [plan.md](plan.md) and [phase-03](phase-03-backend-google-id-token-endpoint.md)).
  Leave the redirect-URI list empty.
- **Origins are matched exactly.** Scheme + host + port, no trailing slash, no path. `http` is
  permitted **only** for `localhost` / `127.0.0.1`.
- **New origins can take a few minutes to propagate** (occasionally longer). An `origin_mismatch`
  right after saving is often just propagation — wait, then retry in a fresh tab, before assuming a
  typo.
- **The client secret this page also generates is not used by Okane** and must never reach Render,
  Vercel, or the repo. The Client ID alone is enough, and it is public by design (it ships inside
  the JS bundle).

## Requirements
**Functional**
- A Google Cloud project exists with the Google Auth Platform configured, **External** audience,
  publishing status **In production**.
- One OAuth 2.0 Client ID of type **Web application** exists, with these four Authorized JavaScript
  origins registered **exactly**:

  | # | Origin | Why |
  |---|---|---|
  | 1 | `https://okane-web.vercel.app` | production web app (Vercel) |
  | 2 | `http://localhost:5173` | `pnpm --filter web dev` (Vite dev server) |
  | 3 | `http://localhost:4173` | `pnpm --filter web preview` (production-build smoke test) |
  | 4 | `http://127.0.0.1:5173` | optional; only if you ever open dev on the IP form instead of `localhost` — Google treats them as different origins |

  **Not registered, deliberately:** `http://localhost:3000` (the NestJS API). The API is never the
  origin of a browser page in this flow — it only receives a `POST` from the web app. Registering it
  would be harmless but meaningless. Add it only if you later serve the built web app from the API
  itself.
- Authorized redirect URIs: **empty**.
- The Client ID string is captured somewhere you can paste from in Phase 6.

**Non-functional**
- The client secret is generated (unavoidable) but recorded nowhere and used nowhere.
- No Google API is enabled beyond the default — Sign in with Google needs none.

## Architecture
What the Console is actually configuring, and which part of Okane consumes it:
```
Google Cloud project "Okane"
 └─ Google Auth Platform
     ├─ Branding   → what the user reads on the consent sheet ("Okane wants to…")
     ├─ Audience   → External + In production  (who may sign in: anyone)
     └─ Clients
         └─ Web application client
             ├─ Client ID  ──────→ VITE_GOOGLE_CLIENT_ID  (Vercel, baked into the JS bundle)
             │                └──→ GOOGLE_CLIENT_ID       (Render, the `aud` we verify against)
             ├─ Client secret ───→ (unused — this flow requires none)
             └─ JS origins  ─────→ which pages Google will hand an ID token to
```
The *same* Client ID goes to both sides on purpose: the frontend uses it to ask for a token, the
backend uses it as the required `audience` when verifying that token. That equality is the check
that stops a token minted for some other app from being accepted by Okane.

## Implementation Steps

### A. Project
1. Open **https://console.cloud.google.com/** and sign in with the Google account that should own
   this (your personal account — the same one the GitHub repo lives under is a reasonable choice).
2. Click the **project picker** — the dropdown in the blue top bar, immediately right of the
   "Google Cloud" logo (it shows the current project name, or "Select a project").
3. In the dialog, click **NEW PROJECT** (top right).
4. **Project name:** `Okane`. Leave **Organization** / **Location** at whatever is prefilled
   (`No organization` for a personal account).
5. Click **CREATE**. Wait for the notification bell to show it finished (~10 s).
6. Open the project picker again and **select `Okane`**. Confirm the top bar now reads `Okane`
   before doing anything else — configuring the wrong project is the single most common way this
   phase silently goes wrong.

### B. Google Auth Platform — Branding
7. In the search bar at the top, type **`Google Auth Platform`** and click the result. (Equivalent
   path: hamburger menu ☰ → **APIs & Services** → **OAuth consent screen**, which now redirects
   here.)
8. You will land on an **Overview** page with a **GET STARTED** button. Click **GET STARTED**.
9. **App Information** step:
   - **App name:** `Okane`
   - **User support email:** pick your own address from the dropdown.
   - Click **NEXT**.
10. **Audience** step: select **External**. Click **NEXT**.
    - *(`Internal` is only offered on a Google Workspace org account and would restrict sign-in to
      that org. For a personal project, External is the only real option.)*
11. **Contact Information** step: enter your email address. Click **NEXT**.
12. **Finish** step: tick **I agree to the Google API Services: User Data Policy**. Click
    **CONTINUE**, then **CREATE**.
13. You are now on the Google Auth Platform with the left-hand tabs **Overview / Branding /
    Audience / Clients / Data Access / Verification Center**.
14. Optional polish — click **Branding** and set **App logo** (120×120 PNG) and **Application home
    page** (`https://okane-web.vercel.app`). Click **SAVE**. Purely cosmetic on the consent sheet;
    skip if you want.

### C. Audience — publish
15. Click the **Audience** tab.
16. Under **Publishing status** it will read **Testing**. Click **PUBLISH APP**.
17. A dialog appears ("Push to production?"). Click **CONFIRM**.
18. Confirm **Publishing status** now reads **In production**. There is no review, no waiting — this
    is immediate because no sensitive scope is requested.
    - *If Google instead shows a "Prepare for verification" / "Submit for verification" prompt,
      stop and re-check the **Data Access** tab: something sensitive got added. Remove it; only
      `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile` belong here.*

### D. Data Access (optional)
19. Click **Data Access** → **ADD OR REMOVE SCOPES**. Tick `openid`,
    `.../auth/userinfo.email`, `.../auth/userinfo.profile`. Click **UPDATE**, then **SAVE**.
    - This is optional: the Sign in with Google button requests these implicitly. Listing them just
      makes the consent sheet explicit about it. Adding **anything else** here is what drags you
      into the verification queue — don't.

### E. Clients — create the Web application client
20. Click the **Clients** tab → **+ CREATE CLIENT**.
21. **Application type:** select **Web application** from the dropdown.
22. **Name:** `Okane Web` (internal label only; the user never sees it).
23. **Authorized JavaScript origins** — click **+ ADD URI** once per row and paste **exactly**,
    with no trailing slash and no path:
    ```
    https://okane-web.vercel.app
    http://localhost:5173
    http://localhost:4173
    http://127.0.0.1:5173     ← optional, see Requirements
    ```
24. **Authorized redirect URIs** — **leave completely empty.** Do not add
    `https://okane-api-7v0o.onrender.com/api/auth/google/callback` or anything like it; this flow
    has no redirect leg and no such route will ever exist (see Key Insights).
    - *If the Console refuses to save with an empty redirect list — it should not for a pure
      JS-origin client — add `https://okane-web.vercel.app` as the single redirect URI and note it
      here as unused. Do **not** invent an API callback path.*
25. Click **CREATE**.
26. A dialog shows **Client ID** and **Client secret**.
    - Click the copy icon on the **Client ID** (`########-xxxxxxxx.apps.googleusercontent.com`) and
      paste it into your password manager or a scratch note.
    - **Ignore the Client secret entirely.** Do not copy it, do not put it in `.env`, Render, or
      Vercel. This flow doesn't use one.
27. Click **OK**. The client now appears in the **Clients** list; you can reopen it any time to edit
    origins (the Client ID is always re-readable; the secret is not — which doesn't matter).

### F. Record it
28. Paste the Client ID into the Todo List below, **redacted to its first 12 characters** (e.g.
    `123456789012-…`) — enough to confirm which client is live, without putting the full string in
    git. The full value goes into Render and Vercel in
    [phase-06](phase-06-deployment-env-and-docs.md), and into your local untracked
    `apps/api/.env` + `apps/web/.env` for dev.

## Todo List
- [ ] Google Cloud project `Okane` created **and selected** in the top bar
- [ ] Google Auth Platform configured: app name, support email, **External**, contact email
- [ ] Audience → Publishing status = **In production**
- [ ] (optional) Data Access limited to `openid` + `userinfo.email` + `userinfo.profile`
- [ ] Web application client `Okane Web` created
- [ ] JS origins registered: `https://okane-web.vercel.app`, `http://localhost:5173`, `http://localhost:4173`
- [ ] Authorized redirect URIs left **empty**
- [ ] Client ID captured (record the first 12 chars here: `____________`)
- [ ] Client secret deliberately discarded — not stored anywhere

## Success Criteria
The **Clients** list shows one Web application client whose detail page lists the three (or four)
origins exactly as typed, and the **Audience** tab reads **In production**. Nothing is provable
beyond that until Phase 4 renders a button and Phase 6 deploys — which is precisely why this phase
blocks no code.

## Risk Assessment
| Risk | Likelihood | Impact | Countermove |
|---|---|---|---|
| Origin typo (trailing slash, `https` on localhost, wrong port) → `"The given origin is not allowed for the given client ID"` at click time | **High** | Medium | Step 23's exact strings; re-read the client's detail page character by character before debugging code |
| Configured under the wrong Cloud project | Medium | Medium | Step 6 — confirm the top bar reads `Okane` |
| Left in **Testing** → every new signer-in must be added as a test user, plus an "unverified app" scare screen | Medium | **High** (looks exactly like a broken feature) | Step 16–18; Phase 6 re-checks publishing status as part of production verification |
| Following an old tutorial that says "OAuth consent screen" and getting lost | **High** | Low | Step 7 names the current page and the redirect from the old one |
| Client secret pasted into Render "just in case" → an unnecessary production secret to rotate | Medium | Medium | Step 26 + [phase-06](phase-06-deployment-env-and-docs.md) lists exactly two env vars, neither a secret |
| Propagation delay mistaken for a config error | Medium | Low | Wait ~5 min, retry in a fresh tab, before changing anything |
| Adding a sensitive scope → dumped into the verification queue | Low | **High** (blocks publishing for days) | Step 19's warning; keep Data Access to the three basic scopes or empty |

**Rollback:** delete the client under **Clients**, or delete the whole Cloud project
(IAM & Admin → Settings → **SHUT DOWN**). Nothing in the repo depends on it existing — with
`GOOGLE_CLIENT_ID` unset the app degrades to today's disabled button by design.

## Security Considerations
- **The Client ID is public.** It ships inside the Vercel JS bundle and is visible in devtools. That
  is normal and safe: it identifies the app, it does not authenticate it. Security comes from (a)
  Google only issuing tokens to registered origins, and (b) the backend verifying the token's
  signature and `aud` in [phase-03](phase-03-backend-google-id-token-endpoint.md).
- **The Client secret is a real secret and is not needed.** Not copying it is strictly better than
  storing it safely.
- **Publishing to production means any Google account on earth can create an Okane account.** That
  is the intended behavior for a public signup page (the email/password form already allows the
  same). If you ever want it restricted to a few people, that is an allowlist in `AuthService`, not
  a Console setting — and it is not in scope here.
- The `email_verified` claim Phase 3 depends on is only trustworthy because the token is signed by
  Google and audience-bound to this exact client. Both halves of that come from this phase.

## Next Steps
→ Hand the Client ID to [phase-06](phase-06-deployment-env-and-docs.md).
→ Code work ([phase-02](phase-02-prisma-schema-google-identity.md) onward) can start before, during,
or after this phase.
