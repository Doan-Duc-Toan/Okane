import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Must win the race against @prisma/client's own .env auto-load — see
    // test/setup-e2e-env.ts for why this is not redundant with AppModule's
    // ConfigModule.forRoot({ envFilePath: '.env.test' }).
    setupFiles: ['./test/setup-e2e-env.ts'],
    // All e2e specs share one real okane_test Postgres instance, and
    // RateSnapshot/RateAlert (Phase 5) are global tables, not per-user rows —
    // unlike Goal/User isolation, a concurrent file can observe another
    // file's in-flight snapshot writes. Run files sequentially so each
    // suite's arrange/assert steps against those shared tables are
    // deterministic.
    fileParallelism: false,
  },
});
