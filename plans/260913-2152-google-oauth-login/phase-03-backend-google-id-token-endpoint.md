# Phase 3: Backend — `POST /api/auth/google`, verification and account linking

## Context Links
- Plan overview: [plan.md](plan.md)
- Depends on: [phase-02](phase-02-prisma-schema-google-identity.md) (`googleId` must exist)
- Parallel with: [phase-04](phase-04-frontend-google-sign-in-button.md) — disjoint files, shared
  frozen contract below
- Verified by: [phase-05](phase-05-tests-unit-and-e2e.md)
- House patterns: `apps/api/src/auth/token.service.ts` (injectable single-responsibility service),
  `apps/api/src/auth/dto/register.dto.ts` (i18n-key `message`s),
  `apps/api/src/config/env.validation.ts` (every env var declared)

## Overview
- **Priority:** the core of the feature.
- **Status:** pending
- **Effort:** 1.5h
- One dependency, one new service, one DTO, one controller method, one `AuthService` method.

## Key Insights

### Why the ID-token flow and not Passport's Authorization Code flow
The deciding constraint is deployment topology, not taste. `okane-web.vercel.app` and
`okane-api-7v0o.onrender.com` are **different registrable domains**.

| | ID token (chosen) | Authorization Code via `passport-google-oauth20` |
|---|---|---|
| Who talks to Google | the browser, via Google's own button | the API, via two redirects |
| New routes | `POST /api/auth/google` | `GET /api/auth/google` + `GET /api/auth/google/callback` |
| Getting the session back to the SPA | it's the HTTP response body — identical shape to `/auth/login` | the callback runs on the *API* domain. A cookie set there is **not readable** by the Vercel origin, so it must either redirect to `https://okane-web.vercel.app/#access=…` (tokens in browser history, referrer, and any extension reading the URL) or mint a short-lived one-time code, persist it, and add a third endpoint to exchange it |
| Secrets on Render | `GOOGLE_CLIENT_ID` (public value) | + `GOOGLE_CLIENT_SECRET` (a real secret to store and rotate) |
| New deps | `google-auth-library` | `passport-google-oauth20` + `@types/…` (+ `google-auth-library` anyway if you verify) |
| Reuses `auth-context.tsx` unchanged | yes | no — needs a new "consume tokens from URL on mount" path |
| CORS | already correct (`CORS_ORIGINS`) | unchanged, but the redirect chain adds its own failure modes |

The code flow's one genuine advantage — receiving a Google **refresh token** for calling Google APIs
later — buys nothing: Okane wants a name and an email, once, at sign-in. Paying two endpoints, a
production secret, and a token-smuggling redirect for an unused capability fails YAGNI outright.

**Cost of the chosen path, stated honestly:** it depends on a third-party script
(`accounts.google.com/gsi/client`) loading in the browser; a blocker extension or a hard CSP will
kill the button. Email/password remains as the always-available fallback, and the button degrades to
absent rather than broken ([phase-04](phase-04-frontend-google-sign-in-button.md)).

### Other findings
- **`verifyIdToken` already validates signature, `iss`, `aud` and `exp`.** No manual `iss` check is
  needed; adding one is noise. What it does **not** decide for you is `email_verified` — that is
  ours to enforce, and it is the entire security basis for linking.
- **`google-auth-library@11.0.2`** is current (`npm view`, 2026-09-13) and requires Node ≥22
  (Render and local are on 24 — fine). Its rejection on a bad token is a plain `Error` with a
  message like `Wrong recipient` / `Token used too late`; **do not branch on the error class** —
  catch broadly and map to one key.
- **The verifier must be an injectable wrapper, not a `new OAuth2Client()` inside `AuthService`.**
  Without that seam, every test either mints real Google tokens (impossible) or reaches Google's
  cert endpoint over the network (flaky). This one design choice is what makes
  [phase-05](phase-05-tests-unit-and-e2e.md) deterministic.
- **`GOOGLE_CLIENT_ID` must be optional config.** It is absent in `.env.test`, in CI, and on any
  fresh clone. A required env var would make the whole API refuse to boot — the existing `validate()`
  throws on missing properties. Optional + a 503 at the endpoint is the graceful shape.
- **The P2002 race is real but rare.** Two simultaneous first-ever sign-ins by the same Google
  account both miss the lookup and both insert. Prisma's existing global filter would turn that into
  a 409 carrying **English prose** (`"A record with this email already exists"`) — a violation of the
  i18n-key contract. Catch `P2002` inside the service and re-read instead.

## Requirements
**Functional**
- `POST /api/auth/google` `{ credential: string }` → `200` with the existing `AuthResult` shape.
- Resolution order: `googleId` match → verified-email match (link) → create.
- Reject: malformed/expired/wrong-audience token; payload without an email; `email_verified !== true`.
- `503` when `GOOGLE_CLIENT_ID` is unconfigured.

**Non-functional**
- Every error message is a stable camelCase i18n key. Zero English prose.
- No change to `/auth/login`, `/auth/register`, `/auth/refresh`, `/auth/logout`, `TokenService`, or
  `PROFILE_SELECT`.
- `@Public()` on the new route (the global `JwtAuthGuard` fails closed otherwise).

## Architecture

**Frozen wire contract — [phase-04](phase-04-frontend-google-sign-in-button.md) codes against this:**
```
POST /api/auth/google          (public, no Authorization header)
Request:  { "credential": "<Google ID token JWT>" }
200:      { accessToken, refreshToken, expiresIn, user: { id, email, displayName, locale, theme } }
          ^ byte-identical shape to POST /api/auth/login
400:      { message: ["credentialRequired"] }        — empty/missing/non-string field
401:      { message: ["googleTokenInvalid"] }        — signature, aud, exp, or parse failure
401:      { message: ["googleEmailUnverified"] }     — email_verified !== true, or no email claim
503:      { message: ["googleNotConfigured"] }       — GOOGLE_CLIENT_ID unset on the server
```
`200` (not `201`) even when the account is created: one endpoint, one status, and the client cannot
know in advance which case it is.

**Resolution flow:**
```
credential
   │
   ▼ GoogleTokenVerifier.verify()   ── throws ─→ 401 googleTokenInvalid
payload { sub, email, email_verified, name }
   │
   ├─ !email || email_verified !== true ────────→ 401 googleEmailUnverified
   ▼
findByGoogleId(sub) ──found──→ sign in (existing linked account)
   │ none
   ▼
findByEmail(email.toLowerCase())
   │
   ├─ found, googleId == null ──→ LINK: set googleId = sub ──→ sign in
   ├─ found, googleId == sub ───→ sign in  (concurrent-write race landed here)
   ├─ found, googleId != sub ───→ 401 googleEmailUnverified  (a different Google account already owns this email — do not overwrite)
   │ none
   ▼
create { email, googleId: sub, passwordHash: null, displayName: name ?? null }
   │  P2002 ──→ re-run the two lookups once, then sign in
   ▼
TokenService.issuePair(user.id, user.email)   ← unchanged, shared with password login
```

**Why auto-linking by email is safe — and where the line is.**
`email_verified: true` is Google asserting, under its own signature, that this account controls that
mailbox. Anyone controlling that mailbox can already take over the Okane account the moment password
reset exists (backlog), so linking grants no capability they don't functionally have. The risk being
avoided is the *unverified* case: without the flag check, an attacker who creates a Google account
claiming `victim@example.com` (possible with some custom-domain configurations) would be handed the
victim's existing account. **The check is not optional and must not be relaxed for convenience.**
The user's `passwordHash` is left **untouched** when linking — the account keeps both sign-in methods.
`displayName` is likewise only set at creation time, never overwritten by Google's `name`, because the
user may have customized it.

**New files:**
```
apps/api/src/auth/google-token.service.ts      GoogleTokenVerifier — the only place google-auth-library is imported
apps/api/src/auth/dto/google-login.dto.ts      { credential: string }
```

```ts
// google-token.service.ts — shape only
export interface GoogleIdentity { sub: string; email: string | null; emailVerified: boolean; name: string | null }

@Injectable()
export class GoogleTokenVerifier {
  private readonly client = new OAuth2Client();
  constructor(private readonly config: ConfigService) {}
  get isConfigured(): boolean { /* !!clientId */ }
  async verify(credential: string): Promise<GoogleIdentity> {
    // verifyIdToken({ idToken: credential, audience: clientId }) validates
    // signature + iss + aud + exp for us; anything it rejects, and any payload
    // we can't read, is one UnauthorizedException('googleTokenInvalid').
  }
}
```

## Related Code Files
**Create:**
- `apps/api/src/auth/google-token.service.ts`
- `apps/api/src/auth/dto/google-login.dto.ts`

**Modify:**
- `apps/api/src/auth/auth.service.ts` — add `loginWithGoogle()`; nothing else changes
- `apps/api/src/auth/auth.controller.ts` — `@Public() @HttpCode(200) @Post('google')`
- `apps/api/src/auth/auth.module.ts` — provide `GoogleTokenVerifier`
- `apps/api/src/users/users.service.ts` — add `findByGoogleId`, `linkGoogleId`, `createWithGoogle`
- `apps/api/src/config/env.validation.ts` — `@IsString() @IsOptional() GOOGLE_CLIENT_ID?: string`
- `apps/api/.env.example` — `GOOGLE_CLIENT_ID=""`
- `apps/api/package.json` — `google-auth-library@^11.0.2`

**Do not touch:** `token.service.ts`, `jwt.strategy.ts`, `jwt-auth.guard.ts`, `PROFILE_SELECT`,
`prisma-error.filter.ts`, anything under `apps/web/`.

## Implementation Steps
1. `pnpm --filter api add google-auth-library` (expect `^11.0.2`).
2. Add `GOOGLE_CLIENT_ID` to `env.validation.ts` as **optional**, and to `apps/api/.env.example`.
   Leave `.env.test` without it — Phase 5 overrides the provider, so the tests must pass unconfigured.
3. Write `google-token.service.ts` per the shape above. Catch everything from `verifyIdToken`,
   including a null payload, and throw `new UnauthorizedException('googleTokenInvalid')`. Log the
   real `err.message` server-side via `Logger` (diagnosability) but never return it.
4. Write `google-login.dto.ts`:
   ```ts
   export class GoogleLoginDto {
     @IsString({ message: 'credentialRequired' })
     @IsNotEmpty({ message: 'credentialRequired' })
     credential!: string;
   }
   ```
   (The global `ValidationPipe` has `forbidNonWhitelisted: true` — any extra field is already
   flattened to `unexpectedField` by `validation-error.factory.ts`. Nothing to add.)
5. Add to `users.service.ts`, keeping the `PROFILE_SELECT` discipline:
   - `findByGoogleId(googleId)` → full row (needs `googleId`/`passwordHash` internally)
   - `linkGoogleId(userId, googleId)` → returns `UserProfile`
   - `createWithGoogle(email, googleId, displayName)` → returns `UserProfile`
6. Add `AuthService.loginWithGoogle(dto)` implementing the resolution flow verbatim, including the
   single P2002 retry. Throw `ServiceUnavailableException('googleNotConfigured')` first if
   `!verifier.isConfigured`.
7. Controller method + `@Public()` + `@HttpCode(HttpStatus.OK)`; register the provider in
   `auth.module.ts`.
8. `pnpm --filter api run build` then `pnpm --filter api run lint`.
9. Smoke it with the server unconfigured: `curl -i -X POST localhost:3000/api/auth/google -H
   'content-type: application/json' -d '{"credential":"x"}'` → `503 googleNotConfigured`. Then set a
   dummy `GOOGLE_CLIENT_ID` in `.env`, restart → same call → `401 googleTokenInvalid`. Both bodies
   must contain only the key, never English.
10. Commit (conventional, no AI co-author trailer).

## Todo List
- [ ] `google-auth-library` added
- [ ] `GOOGLE_CLIENT_ID` optional in `env.validation.ts` + `.env.example`
- [ ] `GoogleTokenVerifier` created; `google-auth-library` imported nowhere else
- [ ] `GoogleLoginDto` with i18n-key messages
- [ ] `UsersService`: `findByGoogleId` / `linkGoogleId` / `createWithGoogle`
- [ ] `AuthService.loginWithGoogle` — googleId → verified-email link → create, with P2002 retry
- [ ] `email_verified !== true` rejected **before** any lookup
- [ ] `@Public() @HttpCode(200) @Post('google')` + provider registered
- [ ] Build + lint clean; both curl smoke checks return key-only bodies
- [ ] Committed

## Success Criteria
With a dummy client ID configured, every rejection path returns the right status and a bare i18n key.
With the verifier faked ([phase-05](phase-05-tests-unit-and-e2e.md)): an unknown Google identity
creates a user with `passwordHash = NULL`; the same identity twice returns the same `user.id`; a
Google identity whose verified email matches an existing password account returns **that** account's
id, with its `passwordHash` still intact afterwards.

## Risk Assessment
| Risk | Likelihood | Impact | Countermove |
|---|---|---|---|
| `email_verified` check omitted or loosened → account takeover by email spoofing | Low | **Critical** | Checked before any DB read; a dedicated Phase 5 unit test; called out in three places in this plan |
| P2002 race surfaces as a 409 with English prose, breaking the i18n contract | Low | Medium | In-service catch + single re-read (step 6) |
| Required `GOOGLE_CLIENT_ID` breaks CI/e2e/fresh-clone boot | **High** if made required | **High** | `@IsOptional()` + 503 path (step 2) |
| Branching on `verifyIdToken`'s error class, which is undocumented and version-unstable | Medium | Medium | Catch broadly; map every failure to one key (step 3) |
| Existing password user's `passwordHash` or `displayName` clobbered on link | Medium | **High** | Link updates `googleId` **only**; asserted in Phase 5 |
| Google `name` written into `displayName` on every login, overwriting user edits | Medium | Low | Set at creation only |
| Two Okane users end up sharing one Google identity | Low | Medium | `@unique` on `googleId` (Phase 2) + the `googleId != sub` rejection branch |
| Render cold start makes the first `POST /auth/google` take ~30–60 s and look hung | Medium | Low | Pre-existing free-tier trait (`docs/deployment.md`); Phase 4 keeps the button in a pending state |

**Rollback:** delete the controller method (the endpoint disappears; nothing else references the new
service) or simply unset `GOOGLE_CLIENT_ID` on Render — the endpoint then 503s and the frontend hides
the button. No data written by this phase needs undoing: linked accounts keep working via password,
and Google-only accounts remain valid rows.

## Security Considerations
- **Audience binding is the whole game.** `audience: GOOGLE_CLIENT_ID` is what stops an ID token
  issued to *any other* Google app — trivially obtainable by an attacker with their own client — from
  being replayed at Okane. Never call `verifyIdToken` without it, never pass `audience: undefined`.
- **`email_verified: true` is mandatory** for both linking and creation. See the reasoning above.
- The ID token is short-lived (~1 h) and single-purpose; it is never stored, never logged, and never
  put in a URL.
- Never log the credential or the decoded payload; log only the failure message and, at most, the
  resolved user id.
- The new endpoint is `@Public()` and unauthenticated by nature. When login rate limiting lands
  (roadmap backlog item 1), **this route must be covered too** — it is an unauthenticated,
  compute-heavy (RSA verification + network cert fetch) path.
- `google-auth-library` caches Google's signing certs; that outbound call is the only new egress the
  API makes. It fails closed (verification throws → 401).

## Next Steps
→ [phase-05](phase-05-tests-unit-and-e2e.md). [phase-04](phase-04-frontend-google-sign-in-button.md)
may already be underway in parallel against the frozen contract above.
