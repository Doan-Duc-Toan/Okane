# Study Report: Okane Stack Decisions (repo layout, NestJS structure, ORM, auth, React stack, dev workflow)

Date: 2026-09-10. Sources: 5 web searches, cross-referencing Encore.dev, dev.to, Medium practitioner writeups, GitHub reference repos (no single-source claims below).

## 1. Repo layout
**Call: plain `pnpm workspaces`, two folders (`apps/web`, `apps/api`), no Nx/Turborepo yet.**
pnpm workspaces give native monorepo linking (shared `packages/shared-types` for DTOs later) with zero extra config — YAGNI for a 1-person project. Add Turborepo only if/when a 3rd app (mobile) makes build/caching friction real; it drops in later without restructuring (`pnpm-workspace.yaml` stays, just add `turbo.json`). Nx not justified — its code-gen/affected-graph value shows up at team scale, not solo. Consensus across 3 sources: pnpm+Turborepo is the 2026 default for small JS/TS setups; pnpm alone is fine until caching pain appears.

## 2. NestJS structure
**Call: feature-module-per-domain, not layered-by-type.**
`AuthModule`, `UsersModule`, `GoalsModule`, `SavingsEntriesModule`, `ExchangeRateModule` — each owns its controller/service/dto/entity/tests. Global `ValidationPipe({whitelist:true, forbidNonWhitelisted:true, transform:true})` in `main.ts`; DTOs via `class-validator`/`class-transformer`. `@nestjs/config` for env (`.env` per app, `ConfigModule.forRoot({isGlobal:true})`). `ExchangeRateModule` should own both the FX-proxy service and rate-alert logic (scheduled via `@nestjs/schedule`) — keep it one module since alerts depend directly on the rate-fetch service (DRY, avoid premature split).

## 3. Database + ORM
**Call: Prisma.** One-liner: best migration DX for a team-of-one (`prisma migrate dev` locally → `prisma migrate deploy` in CI/prod, versioned SQL migration files auto-generated, zero hand-written SQL needed) plus mature NestJS integration docs.
Trade-off: Drizzle is close — thinner, SQL-shaped, better for edge/serverless — but its migration story is more manual/opinionated to wire yourself, added maintenance for a solo dev. TypeORM ruled out — slower dev cadence, decorator/entity coupling to persistence, only worth it if inheriting an existing codebase (not the case, greenfield).

## 4. Auth approach
**Call: confirmed — JWT (access + refresh), not sessions.** Sessions require cookie/CORS gymnastics that don't carry to a future React Native client; JWT is stateless and portable across web + mobile. Packages: `@nestjs/jwt`, `@nestjs/passport`, `passport-jwt`, `bcrypt`. Pattern: short-lived access token (~15 min), longer refresh token (7–30 days) hashed and stored server-side (allows revocation), rotated on use. `AuthGuard('jwt')` per-controller or global `APP_GUARD` with `@Public()` decorator for open routes.

## 5. React frontend stack
**Call: Vite + react-router v7 + TanStack Query + CSS custom properties/CSS Modules.**
Vite still standard bundler in 2026, no reason to deviate. react-router v7 for routing (declarative mode fits an SPA, no need for its framework/data-router mode at this scale). TanStack Query: justified even for a small app — replaces hand-rolled loading/error/cache/refetch boilerplate that you'd otherwise write anyway for goals/savings-entries CRUD; low cost (~15KB) for real DX gain. Styling: since design tokens already exist, CSS custom properties + CSS Modules map 1:1 onto tokens with no re-encoding step; Tailwind is a fine alternative if utility-class speed is preferred, but it means translating existing tokens into `tailwind.config` — extra step with no clear win here. Recommend CSS Modules; note Tailwind as acceptable if user later wants faster prototyping.

## 6. CORS/dev workflow
**Call: Vite dev-server proxy, not CORS headers, for local dev.**
Run Nest API on `:3000`, Vite on `:5173`. Set `server.proxy: { '/api': 'http://localhost:3000' }` in `vite.config.ts` so browser requests hit same-origin `/api/*` and Vite forwards — avoids CORS entirely in dev. Still enable `app.enableCors({ origin: [prod domain] })` in Nest for production (mobile app / deployed web won't share origin). Env: `VITE_API_URL` unused in dev (proxy handles it), set to real API URL in prod build; Nest uses standard `.env` via `@nestjs/config`.

## Ranked summary
1. pnpm workspaces (no monorepo tool yet)
2. Prisma
3. JWT access+refresh (`@nestjs/jwt`+`@nestjs/passport`+`passport-jwt`+`bcrypt`)
4. Vite + react-router v7 + TanStack Query + CSS Modules/custom properties
5. Vite proxy for dev, CORS only for prod

## Limits / unresolved
- Exact FX API provider not specified — rate limits/auth model of that provider will affect `ExchangeRateModule` caching strategy (not researched here).
- Rate-alert delivery mechanism (email/push/in-app) undetermined — affects whether `@nestjs/schedule` alone suffices or a queue (BullMQ) is needed later.
- Refresh-token device/session tracking (multi-device support for future mobile) not scoped — matters once mobile ships, out of scope for web-only MVP.
- Version pins not hard-confirmed against official changelogs (search results didn't surface exact NestJS/Prisma/TanStack Query major version numbers for Sept 2026) — verify with `tkm:search-docs` right before scaffolding if exact pins matter.
