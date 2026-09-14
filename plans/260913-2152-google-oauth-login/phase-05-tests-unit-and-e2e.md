# Phase 5: Tests — unit (linking logic) and e2e (real HTTP, faked verifier)

## Context Links
- Plan overview: [plan.md](plan.md)
- Depends on: [phase-03](phase-03-backend-google-id-token-endpoint.md) (the seam), and
  [phase-04](phase-04-frontend-google-sign-in-button.md) only for the frontend build check
- House style to copy exactly: `apps/api/src/auth/token.service.spec.ts` (hand-rolled in-memory
  fakes, no `vi.mock` of Prisma, behavioral test names) and `apps/api/test/auth.e2e-spec.ts`
  (full `AppModule`, real `okane_test` Postgres, `supertest`)
- Runners: `pnpm --filter api test` (unit), `pnpm --filter api test:e2e` (e2e, `NODE_ENV=test`,
  `fileParallelism: false`)

## Overview
- **Priority:** the gate. The `email_verified` assertion below is the single most important test in
  this plan.
- **Status:** pending
- **Effort:** 1.5h
- One new unit spec, one new e2e spec. No changes to existing specs.

## Key Insights
- **`GoogleTokenVerifier` is the whole reason this phase is cheap.** A real Google ID token cannot be
  minted in a test (it is RSA-signed by Google), and letting the real verifier run would either fail
  or reach Google's cert endpoint over the network. Substituting the provider gives deterministic,
  offline coverage of *our* logic, which is the part that can actually be wrong.
- **E2E overrides the provider, it does not mock the HTTP layer.** `Test.createTestingModule({
  imports: [AppModule] }).overrideProvider(GoogleTokenVerifier).useValue(fake)` keeps the real
  controller, real `ValidationPipe`, real guard, real `TokenService`, real Postgres — everything
  except the one thing that would need Google. Same posture as the existing auth e2e.
- **`.env.test` has no `GOOGLE_CLIENT_ID`** and must stay that way; the fake reports
  `isConfigured: true`, so the 503 branch gets its own test using a fake that reports `false`.
- **The password-side regression matters as much as the new path.** Phase 2 made `passwordHash`
  nullable — a bug there is an authentication bypass. Test it from both sides: unit (service) and
  e2e (real HTTP round-trip for a Google-only account trying the password form).
- **No frontend unit test for the button.** Following the precedent set in
  `plans/260912-1931-pwa-ios-install/` (config and third-party-script wiring got no unit tests, only
  the one piece with branching logic did): a test that mocks `window.google` and asserts we called
  `renderButton` asserts our own mock. The branching worth covering — "no client id → disabled
  button" — is one line and is verified by step 5's manual check plus `tsc -b`. Phase 6's real
  production sign-in is the honest proof.

## Requirements
**Functional coverage (unit, `auth.service.spec.ts`)**
1. Unknown Google identity → creates a user with `googleId = sub`, `passwordHash = null`,
   `displayName` from Google's `name`; returns a token pair.
2. Known `googleId` → returns the **same** user id; no second row created.
3. Verified email matching an existing **password-only** account → links (`googleId` set), returns
   that account's id, and leaves `passwordHash` **and** `displayName` unchanged.
4. `email_verified: false` → `UnauthorizedException('googleEmailUnverified')`, **and no user row is
   created or modified**.
5. Payload with no email → same rejection.
6. Verifier throws (invalid/expired/wrong-audience) → `UnauthorizedException('googleTokenInvalid')`,
   no DB write.
7. Existing account already linked to a *different* `googleId` → rejected, link not overwritten.
8. `isConfigured === false` → `ServiceUnavailableException('googleNotConfigured')`, verifier never
   called.
9. **Regression:** password login against a user with `passwordHash = null` →
   `UnauthorizedException('invalidCredentials')`.
10. **Regression:** existing email/password register + login still behave (guards the nullability
    change).

**Functional coverage (e2e, `auth-google.e2e-spec.ts`)**
1. `POST /api/auth/google` with a faked verified identity → `200`, body shape identical to
   `/auth/login` (`accessToken`, `refreshToken`, `expiresIn`, `user{…}`), and the returned
   `accessToken` works against `GET /api/auth/me`.
2. The returned `refreshToken` rotates through `POST /api/auth/refresh` — proving the Google session
   is a first-class session, not a special case.
3. Same identity twice → same `user.id`.
4. Register with a password, then Google sign-in with that same verified email → **same `user.id`**,
   and the password login still works afterwards.
5. `email_verified: false` → `401` with body `message` containing exactly `googleEmailUnverified`.
6. Verifier throws → `401` / `googleTokenInvalid`.
7. `{}` (no credential) → `400` / `credentialRequired`; `{ credential: 'x', extra: 1 }` → `400` /
   `unexpectedField` (proves `forbidNonWhitelisted` covers the new DTO).
8. A Google-created (password-less) account posting to `/api/auth/login` → `401`, body **byte-identical**
   to an unknown-email 401 (no account-existence oracle).
9. **Every** error body asserted to contain only camelCase keys — no English prose, no Prisma text.

**Non-functional**
- Zero network calls; `pnpm --filter api test` passes on a clone with no `.env` Google config.
- Every created user deleted in `afterAll`, matching the existing suite's cleanup discipline.
- Test emails carry `Date.now()` to survive re-runs (existing convention).

## Architecture
```
unit  ── auth.service.spec.ts
          ├─ FakeUsersStore        in-memory Map, implements only the UsersService slice
          │                        AuthService touches (findByEmailWithPassword, findById,
          │                        findByGoogleId, linkGoogleId, createWithGoogle, create)
          ├─ FakeGoogleVerifier    { isConfigured, verify: () => identity | throw }
          └─ real TokenService     (already unit-proven; needs only a fake refreshToken store —
                                    reuse the FakeRefreshTokenStore pattern from token.service.spec.ts)

e2e   ── auth-google.e2e-spec.ts
          Test.createTestingModule({ imports: [AppModule] })
            .overrideProvider(GoogleTokenVerifier).useValue(mutableFake)   ← the ONLY substitution
          → real Nest app, real ValidationPipe + global guard, real okane_test Postgres
```
The e2e fake is **mutable** (`fake.next = { sub, email, emailVerified }` / `fake.throwNext = true`)
so one app instance serves every case without rebuilding the module per test.

## Related Code Files
**Create:**
- `apps/api/src/auth/auth.service.spec.ts`
- `apps/api/test/auth-google.e2e-spec.ts`

**Do not modify:** `token.service.spec.ts`, `auth.e2e-spec.ts`, or any production source. If a test
cannot be written without changing production code, that is a Phase 3 design defect — fix it there
and say so, don't bend the test.

## Implementation Steps
1. Write `FakeUsersStore` + `FakeGoogleVerifier` at the top of `auth.service.spec.ts`, mirroring
   `token.service.spec.ts`'s `FakeRefreshTokenStore` comment style (say *why* the fake exists and
   which slice it implements).
2. Add a `buildAuthService()` helper returning `{ authService, users, verifier }`, cast the fakes
   with `as never` at the constructor boundary exactly as `token.service.spec.ts` does.
3. Write unit cases 1–10. Name them behaviorally ("links an existing password account when Google
   reports the email verified"), not after method names.
4. Case 4 and 6 must assert **both** the thrown exception **and** `users.rows.size` unchanged — "no
   user was created" is half the assertion.
5. Write `auth-google.e2e-spec.ts` from `auth.e2e-spec.ts`'s skeleton (`beforeAll` builds the app
   with the `.overrideProvider` line, `afterAll` deletes by email and closes).
6. For case 4 (e2e linking), register with a password first, capture `user.id`, then Google sign-in
   with the same email, then assert equal ids **and** that `POST /api/auth/login` with the original
   password still returns `200`.
7. For case 8, capture the unknown-email 401 body and `expect(googleOnly401.body).toEqual(unknown401.body)` —
   the same assertion style `auth.e2e-spec.ts` already uses for the timing/oracle test.
8. Start local Postgres, ensure `okane_test` has the Phase 2 migration applied, then:
   `pnpm --filter api test` and `pnpm --filter api test:e2e`. Both green.
9. `pnpm --filter api run lint`, `pnpm --filter web test`, `pnpm --filter web run build` — nothing
   regressed on either side.
10. Commit (conventional, no AI co-author trailer).

## Todo List
- [ ] `auth.service.spec.ts` created with in-memory fakes (no `vi.mock` of Prisma)
- [ ] Unit cases 1–3 (create / reuse / link)
- [ ] Unit case 4 — `email_verified: false` rejected **and no row written** ← the critical one
- [ ] Unit cases 5–8 (no email, verifier throws, mismatched link, not configured)
- [ ] Unit cases 9–10 — null-`passwordHash` login rejected; existing password flows intact
- [ ] `auth-google.e2e-spec.ts` created with the single `.overrideProvider` substitution
- [ ] E2E cases 1–3 (session shape, refresh rotation, idempotent identity)
- [ ] E2E case 4 — link preserves the password account and its password
- [ ] E2E cases 5–7 (unverified, invalid, DTO validation keys)
- [ ] E2E case 8 — no account-existence oracle
- [ ] E2E case 9 — every error body is camelCase keys only
- [ ] All four suites green (api unit, api e2e, web test, web build); cleanup leaves no test rows
- [ ] Committed

## Success Criteria
`pnpm --filter api test` and `pnpm --filter api test:e2e` both pass with no network access and no
`GOOGLE_CLIENT_ID` set anywhere. Deleting the `email_verified` check in `AuthService` makes unit case
4 and e2e case 5 fail — verify this by temporarily breaking it, then restore. A test suite that stays
green when you remove the security check is not a test suite.

## Risk Assessment
| Risk | Likelihood | Impact | Countermove |
|---|---|---|---|
| Tests written so loosely they'd pass with the `email_verified` check removed | Medium | **Critical** | Success Criteria mandates a deliberate break-and-confirm |
| The real verifier leaks into e2e → network flake / cert-fetch failures in CI | Medium | Medium | Exactly one `.overrideProvider`; if a test needs network, it is misconfigured |
| Fakes drift from `UsersService`'s real signatures and the suite proves nothing | Medium | Medium | Type the fakes against the real interface where practical; `as never` only at the constructor, as the house style does |
| `okane_test` missing the Phase 2 migration → "column googleId does not exist" read as a code bug | Medium | Low | Step 8 states it; Phase 2 step 5 already applied it |
| E2E rows left behind, polluting later runs | Medium | Low | `afterAll` deletes every email the suite creates; `Date.now()` suffixes make collisions impossible anyway |
| Chasing frontend button coverage with heavy `window.google` mocks | Medium | Low (wasted effort) | Explicitly out of scope — see Key Insights; Phase 6 is the real proof |

**Rollback:** delete the two new spec files. They touch no production code, so nothing else moves.

## Security Considerations
- Unit case 4 and e2e case 5 **are** the account-takeover regression test. Treat them as
  load-bearing; never mark them `skip` to get a build green.
- Unit case 9 / e2e case 8 guard the nullable-`passwordHash` bypass introduced in Phase 2.
- E2E case 8 also preserves the existing no-account-enumeration property — the new endpoint must not
  become the oracle that `/auth/login` was carefully built not to be.
- Fake credentials are opaque strings (`'fake-credential'`); no real Google token, expired or
  otherwise, belongs in the repo.

## Next Steps
→ [phase-06](phase-06-deployment-env-and-docs.md).
