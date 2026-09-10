/**
 * Loaded via vitest.config.e2e.ts's `setupFiles`, once per test file, before
 * that file's own imports run. This exists to close a real ordering bug: any
 * e2e spec that imports `PrismaService` transitively imports `@prisma/client`,
 * whose generated client auto-loads `.env` (not `.env.test`) as an import-time
 * side effect. That happened *before* `AppModule`'s own
 * `ConfigModule.forRoot({ envFilePath: NODE_ENV === 'test' ? '.env.test' : '.env' })`
 * ever ran, and dotenv never overrides an already-set `process.env.DATABASE_URL`
 * — so every e2e suite was silently connecting to the **dev** `okane` database
 * instead of `okane_test`, contrary to the documented intent in app.module.ts.
 * Confirmed live: a manual Phase 5 cron-idempotency check left a stray
 * RateSnapshot row in dev `okane` instead of `okane_test` before this fix.
 *
 * `process.loadEnvFile` (Node >=20.6, no extra dependency) never overrides a
 * key already present in `process.env`, same as dotenv — but run here, before
 * any test file's own imports execute, it is the first writer, so it wins.
 */
process.loadEnvFile('.env.test');
