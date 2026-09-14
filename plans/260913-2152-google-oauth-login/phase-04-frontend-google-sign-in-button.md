# Phase 4: Frontend — live Google button, shared session handoff, VI/JA

## Context Links
- Plan overview: [plan.md](plan.md)
- Contract: [phase-03](phase-03-backend-google-id-token-endpoint.md) → "Frozen wire contract".
  **Parallel-runnable with Phase 3** — disjoint files.
- Rewires: `apps/web/src/features/auth/components/google-button.tsx` (today: deliberately disabled)
- Session code path that must be reused, not copied: `apps/web/src/contexts/auth-context.tsx`
- Callers: `apps/web/src/features/auth/login-page.tsx`, `register-page.tsx`

## Overview
- **Priority:** the visible half.
- **Status:** pending
- **Effort:** 1.5h
- Load Google's script, render Google's button in place of the disabled one, POST the credential,
  hand the returned session to the **existing** `login()`.

## Key Insights
- **The button already exists and is honestly disabled.** `google-button.tsx`'s own comment says it
  was left in place because wiring it needs external credentials. This phase is that wiring — edit it
  in place, keep the `AuthCard` layout and the `login.or` divider exactly as approved.
- **GIS is still the current API** (checked 2026-09-13): `<script async src="https://accounts.google.com/gsi/client">`
  then `google.accounts.id.initialize({ client_id, callback })` + `google.accounts.id.renderButton(el, opts)`.
  No successor library, no forced migration.
- **FedCM:** `use_fedcm_for_prompt` is **deprecated and ignored — do not write it**. `use_fedcm_for_button`
  is *optional* for the rendered-button flow (the legacy path still works). Set it to `true`
  proactively: low risk today, and it is the path Chrome is moving everyone to. Okane uses the
  rendered button only — **no One Tap, no `prompt()`, no auto-select**, which sidesteps the
  FedCM-mandatory area entirely.
- **React 19 StrictMode double-invokes effects in dev**, so a naive effect renders Google's button
  twice into the same div. Guard with a ref flag and clear the container before rendering.
- **Load the script once, globally.** GIS attaches `window.google`; re-injecting the tag per mount
  double-registers handlers. One module-level promise-returning loader, shared.
- **No client ID → render exactly what ships today.** `VITE_GOOGLE_CLIENT_ID` is baked in at build
  time; on a fresh clone or a local dev run it is empty. In that case keep the current disabled
  "coming soon" button — layout preserved, honest, and no crash from calling `initialize` with an
  empty id. This is why the `login.googleComingSoon` key **stays**.
- **DRY on the success path.** Login currently does `queryClient.clear() → login(session) →
  adoptServerPreferences(session) → navigate(...)`; register does the first two plus `navigate('/')`
  and has **no** preference adoption (a pre-existing small gap). Google sign-in needs the same four
  steps on both pages. Extract one `useAuthSuccess()` hook and route all four call sites through it —
  password-login, password-register, and both Google buttons — rather than writing the sequence a
  third and fourth time.
- **Cross-origin is already solved.** `apiClient.post('/auth/google', …)` inherits `API_BASE_URL`
  from `VITE_API_URL`. Nothing about CORS, cookies, or redirects enters this phase — that is the
  payoff of the flow chosen in Phase 3.

## Requirements
**Functional**
- A real Google button on **both** `/login` and `/register`, in the same slot as today's.
- On credential: `POST /api/auth/google` → on success, the user lands exactly where a password login
  would (login: `location.state.from` or `/`; register: `/`), with locale/theme adopted from the
  server profile.
- On failure: an inline form-level error, translated, in the page's existing `formError` banner.
- Build without `VITE_GOOGLE_CLIENT_ID` → today's disabled button; no console error, no crash.

**Non-functional**
- `auth-context.tsx` is **not modified**. Google sign-in calls the same `login(session)`.
- No new runtime dependency (the GIS script is loaded, not bundled).
- VI and JA both complete — no key present in one locale and missing in the other.
- Files stay under the 200-line house limit.

## Architecture
```
login-page.tsx / register-page.tsx
   └─ <GoogleButton redirectTo={…} onError={setFormError} />
         ├─ useGoogleIdentity()          lib/google-identity.ts — inject <script> once, resolve window.google
         ├─ google.accounts.id.initialize({ client_id, callback, use_fedcm_for_button: true })
         ├─ google.accounts.id.renderButton(divRef, { theme, size, width, locale })
         └─ callback({ credential })
               └─ useGoogleLogin()  →  authApi.googleLogin({ credential })  →  POST /api/auth/google
                     └─ onSuccess(session) → useAuthSuccess()(session, redirectTo)
                                                 ├─ queryClient.clear()
                                                 ├─ login(session)            ← existing auth-context
                                                 ├─ adopt locale + theme
                                                 └─ navigate(redirectTo, { replace: true })
```
The `AuthSession` type in `api-client.ts` already matches the response — no new type needed.

**Error mapping (in `GoogleButton`, surfaced through `onError`):**
| Cause | Shown |
|---|---|
| `ApiError` with any status | `err.message` — already translated by `extractErrorDetails` via `apiError.<key>` |
| non-`ApiError` (fetch/network/Render cold start timeout) | `t('login.error.network')` (existing key) |
| GIS script failed to load, or Google returned no credential | `t('login.error.google')` (new key) |

**New i18n keys** (`vi.json` + `ja.json`, both files, same shape):
```
login.error.google      vi "Không thể đăng nhập bằng Google. Vui lòng thử lại."
                        ja "Googleでログインできませんでした。もう一度お試しください。"
apiError.googleTokenInvalid      vi "Đăng nhập Google không hợp lệ. Vui lòng thử lại."
                                 ja "Googleの認証情報が無効です。もう一度お試しください。"
apiError.googleEmailUnverified   vi "Email Google này chưa được xác minh nên không thể dùng để đăng nhập."
                                 ja "このGoogleアカウントのメールアドレスは確認されていないため使用できません。"
apiError.googleNotConfigured     vi "Đăng nhập Google hiện chưa khả dụng."
                                 ja "Googleログインは現在ご利用いただけません。"
apiError.credentialRequired      vi "Yêu cầu đăng nhập Google không hợp lệ."
                                 ja "Googleログインのリクエストが正しくありません。"
```
Keep `login.google` and `login.googleComingSoon` — both are still used (enabled / unconfigured).

## Related Code Files
**Create:**
- `apps/web/src/lib/google-identity.ts` — one-shot script loader + minimal `window.google.accounts.id` typings
- `apps/web/src/features/auth/hooks/use-google-login.ts` — TanStack mutation, mirrors `use-login.ts`
- `apps/web/src/features/auth/hooks/use-auth-success.ts` — the shared post-session sequence

**Modify:**
- `apps/web/src/features/auth/components/google-button.tsx` — rewired in place
- `apps/web/src/features/auth/auth.api.ts` — `googleLogin({ credential })`
- `apps/web/src/features/auth/login-page.tsx` — pass props to `GoogleButton`; route its password
  success through `useAuthSuccess`
- `apps/web/src/features/auth/register-page.tsx` — render `<GoogleButton>` + the `login.or` divider
  above the footer link; route its password success through `useAuthSuccess`
- `apps/web/src/features/auth/register-page.module.css` — reuse the `divider` rule from
  `login-page.module.css` (copy the rule; the two modules are already separate by design)
- `apps/web/src/i18n/locales/vi.json`, `ja.json` — the keys above
- `apps/web/.env.example` — `VITE_GOOGLE_CLIENT_ID=`

**Do not touch:** `contexts/auth-context.tsx`, `lib/api-client.ts`, `components/auth-card.tsx`,
anything under `apps/api/`.

## Implementation Steps
1. `apps/web/.env.example`: add `VITE_GOOGLE_CLIENT_ID=` under the existing comment block (which
   already warns that `VITE_*` is public — accurate and sufficient here).
2. `lib/google-identity.ts`: module-level `let promise: Promise<GoogleAccountsId> | null`; on first
   call inject `<script src="https://accounts.google.com/gsi/client" async defer>`, resolve on
   `load`, reject on `error`; subsequent calls return the same promise. Declare only the two methods
   used (`initialize`, `renderButton`) — no `@types/google.accounts` dependency for two signatures.
3. `auth.api.ts`: `googleLogin: (payload: { credential: string }) => apiClient.post<AuthSession>('/auth/google', payload)`.
4. `use-google-login.ts`: `useMutation({ mutationFn: authApi.googleLogin })`.
5. `use-auth-success.ts`: returns `(session: AuthSession, to: string) => void` doing clear → login →
   adopt locale/theme → `navigate(to, { replace: true })`. Move `adoptServerPreferences` out of
   `login-page.tsx` into this hook verbatim (comment included) — it is the same behavior, now shared.
6. Rewire `google-button.tsx`:
   - `const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID`; if falsy, `return` today's disabled
     button unchanged.
   - `useEffect` with an `initialized` ref guard (StrictMode): `await loadGoogleIdentity()` →
     `initialize({ client_id: clientId, callback: handleCredential, use_fedcm_for_button: true })` →
     clear `divRef.current.innerHTML` → `renderButton(divRef.current, { theme: 'outline', size:
     'large', width: 320, locale: i18n.language, text: 'signin_with' })`. On loader rejection, call
     `onError(t('login.error.google'))` and leave the slot empty.
   - `handleCredential({ credential })`: if no credential → `onError(t('login.error.google'))`;
     else `mutate({ credential }, { onSuccess: s => authSuccess(s, redirectTo), onError: … })` per
     the error-mapping table.
   - Re-render the button when `i18n.language` changes so its own label follows VI/JA.
7. `login-page.tsx`: replace `<GoogleButton />` with
   `<GoogleButton redirectTo={state?.from?.pathname ?? '/'} onError={setFormError} />`; replace the
   inline success block in `handleSubmit` with `authSuccess(session, state?.from?.pathname ?? '/')`.
8. `register-page.tsx`: same, `redirectTo="/"`; add the `login.or` divider + `<GoogleButton>` between
   the form and the footer link, matching login's order.
9. Add the five key groups to **both** locale files. Verify parity:
   `node -e "const a=require('./apps/web/src/i18n/locales/vi.json'),b=require('./apps/web/src/i18n/locales/ja.json');const f=o=>Object.entries(o).flatMap(([k,v])=>typeof v==='object'?f(v).map(s=>k+'.'+s):[k]);const A=f(a),B=f(b);console.log(A.filter(k=>!B.includes(k)),B.filter(k=>!A.includes(k)))"`
   → must print two empty arrays.
10. `pnpm --filter web run build` (runs `tsc -b` first) and `pnpm --filter web run lint`.
11. Manual dev check **without** a client ID: `/login` and `/register` both show today's disabled
    button, console clean. Then with a real client ID in `apps/web/.env` (needs
    [phase-01](phase-01-google-cloud-console-setup.md)) plus a local API: Google's real button
    renders, and clicking through completes a sign-in.
12. Commit (conventional, no AI co-author trailer).

## Todo List
- [ ] `VITE_GOOGLE_CLIENT_ID` in `.env.example`
- [ ] `lib/google-identity.ts` — single-load promise + minimal typings
- [ ] `auth.api.ts` + `use-google-login.ts`
- [ ] `use-auth-success.ts` extracted; **all four** call sites use it
- [ ] `google-button.tsx` rewired in place, StrictMode-guarded, degrades to disabled with no client id
- [ ] Button on `/login` **and** `/register`, same slot/divider
- [ ] `use_fedcm_for_prompt` appears nowhere; no One Tap / `prompt()` / auto-select
- [ ] VI + JA keys added; parity script prints two empty arrays
- [ ] `pnpm --filter web run build` + lint clean
- [ ] No-client-id dev check passes; real sign-in verified locally (needs Phase 1)
- [ ] Committed

## Success Criteria
With a client ID configured and the API running: clicking the Google button on either page reaches
the dashboard in the same state a password login produces — reload keeps the session (localStorage
refresh token + silent restore), and the server-stored locale/theme are adopted. Without a client ID,
`/login` renders byte-for-byte what it renders today. VI and JA key sets are identical.

## Risk Assessment
| Risk | Likelihood | Impact | Countermove |
|---|---|---|---|
| StrictMode renders two Google buttons in dev | **High** without a guard | Low (dev-only, but misleading) | Ref init-flag + clear the container before `renderButton` (step 6) |
| Duplicating the session-handoff sequence a third/fourth time, then drifting | **High** | Medium | `useAuthSuccess` is mandatory, not optional (step 5) |
| `"The given origin is not allowed for the given client ID"` on localhost | Medium | Medium | Phase 1 registers `:5173` and `:4173`; if it appears, the fix is in the Console, not the code |
| Writing `use_fedcm_for_prompt` from an old tutorial | Medium | Low | Deprecated and ignored — explicitly banned in the Todo List |
| Locale added to `vi.json` only (or `ja.json` only) | Medium | Medium | Step 9's parity script |
| Google's script blocked (extension/offline) → silent dead zone where the button should be | Medium | Low | Loader rejection surfaces `login.error.google`; email/password is untouched and still there |
| Render cold start: the POST hangs ~30–60 s and the user clicks again | Medium | Low | Mutation `isPending` disables re-entry; mutation is idempotent-safe anyway (a replayed credential just re-resolves the same user) |
| `register-page` has no `adoptServerPreferences` today — extracting the hook changes its behavior | Low | Low | It is a strict improvement (register now adopts server prefs too) and matches login; note it in the commit |

**Rollback:** revert `google-button.tsx` and the two pages to the previous commit; the new hooks and
loader become dead files and can be deleted. `auth-context.tsx` was never touched, so no session
behavior can regress. Alternatively, drop `VITE_GOOGLE_CLIENT_ID` from Vercel and redeploy — the
button reverts to disabled with no code change.

## Security Considerations
- `VITE_GOOGLE_CLIENT_ID` is compiled into the public bundle. **Correct and required** — the Client
  ID is public by design. The `.env.example` comment about never putting secrets in `VITE_*` still
  stands; the client *secret* must never appear here.
- The ID token lives in a callback argument and one `fetch` body. Never persist it, never log it,
  never put it in a query string. Only the resulting Okane refresh token is stored, in the existing
  `localStorage['okane.refresh']` slot.
- The credential is **not** trusted client-side — no decoding, no reading `email` from it to display.
  The server's verified response is the only source of user identity.
- Loading `accounts.google.com/gsi/client` is new third-party script execution on the auth pages.
  When CSP lands (roadmap backlog item 2), `script-src`/`connect-src`/`frame-src` will need
  `https://accounts.google.com` — note it there so CSP doesn't silently break login.

## Next Steps
→ [phase-05](phase-05-tests-unit-and-e2e.md), then
[phase-06](phase-06-deployment-env-and-docs.md) for the Vercel env var.
