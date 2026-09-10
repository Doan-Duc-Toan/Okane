import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { validate } from '../src/config/env.validation.js';
import { ExchangeRateModule } from '../src/exchange-rate/exchange-rate.module.js';
import { RateSnapshotScheduler } from '../src/exchange-rate/rate-snapshot.scheduler.js';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * Success-criteria gate for Phase 5: "running the cron twice in one day
 * creates exactly one row." onModuleInit already runs the bootstrap once on
 * app init (first "run"); this suite manually invokes the same private
 * routine a second time to simulate the daily @Cron firing later, and proves
 * the row count does not change. Hits the real provider (open.er-api.com) —
 * same as the manual verification step in phase-05's Implementation Steps.
 */
describe('Rate snapshot cron idempotency (e2e)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let scheduler: RateSnapshotScheduler;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, validate, envFilePath: '.env.test' }),
        PrismaModule,
        ExchangeRateModule,
      ],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init(); // triggers onModuleInit bootstrap (run #1)
    prisma = moduleRef.get(PrismaService);
    scheduler = moduleRef.get(RateSnapshotScheduler);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('creates exactly one snapshot row for today after the first run', async () => {
    const count = await prisma.rateSnapshot.count();
    expect(count).toBe(1);
  });

  it('re-running the same day writes no additional row', async () => {
    // Private on purpose (no DB access belongs on the public API); calling it
    // directly is the "temporary dev-only" hook the phase file describes.
    await (scheduler as unknown as { runSnapshot(): Promise<void> }).runSnapshot();
    const count = await prisma.rateSnapshot.count();
    expect(count).toBe(1);
  });
});
