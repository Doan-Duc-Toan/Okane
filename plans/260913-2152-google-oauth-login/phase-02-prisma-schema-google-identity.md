# Phase 2: Prisma — `passwordHash` nullable + `googleId`

## Context Links
- Plan overview: [plan.md](plan.md)
- Blocks: [phase-03](phase-03-backend-google-id-token-endpoint.md)
- Schema: `apps/api/prisma/schema.prisma` (header says *additive migrations only from here on*)
- Convention doc: `docs/data-model.md` → "Rollback boundary" and the `User` bullet

## Overview
- **Priority:** blocking — Phase 3 cannot compile without `googleId`.
- **Status:** pending
- **Effort:** 0.5h
- Two column changes, one migration, one three-line service guard.

## Key Insights
- **`passwordHash String` → `String?` is the honest model.** A Google-only user has no password.
  The alternatives were weighed and rejected:
  - *Sentinel hash* (store a random unguessable bcrypt hash): keeps `NOT NULL` but makes
    "has a password" indistinguishable from "doesn't", which is exactly the question any future
    "set a password" screen — and today's linking logic — needs to ask.
  - *Separate `AuthIdentity` table* (the textbook multi-provider model): correct at scale, but it
    rewrites the login read path and the `UserProfile` projection for **one** provider. YAGNI.
    Revisit only if a third provider ever appears.
- **The existing login code already tolerates a null hash, on purpose.** `auth.service.ts` computes
  `const hashToCompare = record?.passwordHash ?? DUMMY_HASH` before comparing, so a Google-only user
  who tries the password form pays the same bcrypt cost and gets the same `invalidCredentials` as an
  unknown email. That timing-equalization property must survive this change — see step 4.
- **`googleId` stores Google's `sub`**, not the email. `sub` is the stable, immutable account
  identifier; an email can be changed by the user at Google. Email is the *linking* key, `sub` is
  the *identity* key.
- **Both changes are widening.** No existing row is invalidated: every current user has a
  `passwordHash` and a `NULL` `googleId`. The migration is safe to run on the live Supabase
  database with `prisma migrate deploy` (already in Render's build command).
- **`migrate reset` is no longer a rollback tool.** `docs/data-model.md`'s rollback boundary was
  written pre-deploy; production now holds real data. Local only, never against Supabase.

## Requirements
**Functional**
- `User.passwordHash` accepts `NULL`.
- `User.googleId` exists, nullable, unique — two accounts can never claim one Google identity.
- Existing email/password login and registration behave identically.

**Non-functional**
- One migration, additive/widening only, forward-deployable with no downtime and no data backfill.
- `PROFILE_SELECT` in `users.service.ts` is **not** extended — `googleId` is not a client concern
  and must not start leaking into `/auth/me`.

## Architecture
```prisma
model User {
  id           String    @id @default(uuid())
  email        String    @unique
  passwordHash String?   // null for accounts created via Google that never set one
  googleId     String?   @unique  // Google's `sub` — stable, immutable, never the email
  displayName  String?
  ...
}
```
Generated SQL (expect exactly this shape):
```sql
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;
ALTER TABLE "User" ADD COLUMN "googleId" TEXT;
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");
```
Postgres unique indexes ignore `NULL`s, so every existing password-only row coexists fine.

## Related Code Files
**Modify:**
- `apps/api/prisma/schema.prisma` — the two `User` fields above
- `apps/api/src/auth/auth.service.ts` — explicit null guard in `login()` (step 4)
- `docs/data-model.md` — the `User` bullet now reads "email/password **or Google** account;
  `passwordHash` is null for Google-only accounts"

**Create:**
- `apps/api/prisma/migrations/<timestamp>_google_identity/migration.sql` (generated, then read
  before committing)

**Do not touch:** `users.service.ts`'s `PROFILE_SELECT`, any other model.

## Implementation Steps
1. Edit `schema.prisma` per Architecture above.
2. Local Postgres up (`docker`, port 5433), then
   `pnpm --filter api exec prisma migrate dev --name google_identity`.
3. **Read the generated `migration.sql`** and confirm it matches the three statements above — no
   `DROP TABLE`, no data loss warning. If Prisma proposes anything destructive, stop.
4. In `auth.service.ts` `login()`, make the password-less case explicit rather than relying on the
   dummy-hash accident:
   ```ts
   const hashToCompare = record?.passwordHash ?? DUMMY_HASH;
   const passwordMatches = await bcrypt.compare(dto.password, hashToCompare);
   // A Google-only account has no password to match — reject after the compare
   // above, never before it, so the timing stays identical to a wrong password.
   if (!record || !record.passwordHash || !passwordMatches) {
     throw new UnauthorizedException('invalidCredentials');
   }
   ```
5. Run the test DB migration too (`NODE_ENV=test`-targeted DB is `okane_test`): the e2e suite boots
   against it, so apply with `DATABASE_URL=<okane_test url> pnpm --filter api exec prisma migrate deploy`.
6. `pnpm --filter api run build` and `pnpm --filter api test` — the `passwordHash: string | null`
   type change must not break `users.service.ts` or any caller.
7. Update the `User` bullet in `docs/data-model.md`.
8. Commit (conventional, no AI co-author trailer — repo convention).

## Todo List
- [ ] `schema.prisma` — `passwordHash String?`, `googleId String? @unique`
- [ ] Migration generated and its SQL read and verified as widening-only
- [ ] `login()` null guard added *after* the bcrypt compare (timing preserved)
- [ ] `okane_test` database migrated
- [ ] `pnpm --filter api run build` clean, existing api tests green
- [ ] `docs/data-model.md` `User` bullet updated
- [ ] Committed

## Success Criteria
`prisma migrate deploy` applies cleanly to a copy of the production schema; the full existing api
test suite (unit + e2e) passes unchanged; a manually-inserted row with `passwordHash = NULL` cannot
log in via `/api/auth/login` and produces a byte-identical 401 body to an unknown email.

## Risk Assessment
| Risk | Likelihood | Impact | Countermove |
|---|---|---|---|
| Typing fallout: `passwordHash` becomes `string \| null` across every `findUnique` consumer | Medium | Low | Only `auth.service.ts` reads it (`findByEmailWithPassword`); step 6's build catches anything else |
| Null-hash account becomes loginable via an empty/undefined password | Low | **High** | Explicit `!record.passwordHash` guard (step 4) + a unit test in Phase 5 asserting rejection |
| `googleId` leaks into API responses | Low | Low | `PROFILE_SELECT` is an allowlist projection — nothing added, so nothing leaks by construction |
| Migration run against the wrong database | Low | **High** | `migrate dev` locally only; production applies via Render's existing `migrate deploy` build step, never by hand |
| Forgetting `okane_test` → e2e fails with "column does not exist" and looks like a code bug | Medium | Low | Step 5 is explicit |

**Rollback:** re-adding `NOT NULL` fails once any Google-only row exists — so the honest rollback is
*forward*: drop the `googleId` index/column and leave `passwordHash` nullable (harmless; nothing
writes null unless Phase 3 is deployed). Revert Phases 3–4 first, then decide whether the column is
even worth removing. Never roll back the column while the Google endpoint is live.

## Security Considerations
- Nullable `passwordHash` widens exactly one attack surface: any code path that treats "no hash" as
  "any password works". Step 4's guard plus Phase 5's test is the whole mitigation, and it is the
  single most important assertion in this plan.
- `googleId` unique prevents one Google account from being linked to two Okane users (which would
  make "sign in with Google" nondeterministic).
- `googleId` is not a secret, but it is also not the client's business — keep it out of
  `UserProfile`.

## Next Steps
→ [phase-03](phase-03-backend-google-id-token-endpoint.md) (blocked until this lands).
