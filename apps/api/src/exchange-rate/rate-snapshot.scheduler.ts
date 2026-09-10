import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Currency } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { RateAlertEvaluatorService } from './rate-alert-evaluator.service.js';
import { RateProviderClient } from './rate-provider.client.js';

const DEFAULT_CRON = '0 1 * * *'; // 01:00 UTC, ~1h after the provider's ~00:10 UTC refresh

/**
 * Daily snapshot + alert evaluation, plus a bootstrap catch-up on module
 * init for the two real cases that matter in practice: a laptop asleep at
 * 01:00 UTC, and a fresh deploy with an empty table. Both paths funnel
 * through the same idempotent routine, gated on "does today's row already
 * exist" so a manual re-run (or an overlapping bootstrap+cron) is a no-op
 * rather than a duplicate fetch or a duplicate alert trigger.
 */
@Injectable()
export class RateSnapshotScheduler implements OnModuleInit {
  private readonly logger = new Logger(RateSnapshotScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: RateProviderClient,
    private readonly evaluator: RateAlertEvaluatorService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.runSnapshot();
  }

  @Cron(process.env.FX_SNAPSHOT_CRON || DEFAULT_CRON, { timeZone: 'UTC' })
  async handleCron(): Promise<void> {
    await this.runSnapshot();
  }

  private async runSnapshot(): Promise<void> {
    const today = todayUtc();
    const existing = await this.prisma.rateSnapshot.findUnique({
      where: { base_quote_capturedOn: { base: Currency.JPY, quote: Currency.VND, capturedOn: today } },
    });
    if (existing) return; // already captured today — idempotent no-op

    let fetched;
    try {
      fetched = await this.client.fetchJpyVnd();
    } catch (error) {
      // Never write a bogus snapshot; the app keeps serving /rates/current
      // from the last good snapshot until the next attempt.
      this.logger.error(`Rate snapshot fetch failed, no row written for today: ${String(error)}`);
      return;
    }

    try {
      const prevSnapshot = await this.prisma.rateSnapshot.findFirst({
        where: { base: Currency.JPY, quote: Currency.VND, capturedOn: { lt: today } },
        orderBy: { capturedOn: 'desc' },
      });

      // Upsert (not create): a DB unique constraint + upsert makes a genuine
      // concurrent bootstrap+cron race harmless — but upsert's read-then-write
      // is not perfectly atomic under true concurrency (observed when two app
      // instances bootstrap against the same DB in the same instant: both
      // pass the existence check above, then both hit `create`, and the loser
      // surfaces its own unique-constraint violation instead of silently
      // updating). That race is expected and harmless — another instance
      // already wrote today's row — so it's caught below rather than crashing
      // the app or a still-empty-catch onModuleInit hook.
      await this.prisma.rateSnapshot.upsert({
        where: { base_quote_capturedOn: { base: Currency.JPY, quote: Currency.VND, capturedOn: today } },
        update: {},
        create: {
          base: Currency.JPY,
          quote: Currency.VND,
          rate: fetched.rate.toFixed(8),
          capturedOn: today,
          source: fetched.source,
        },
      });

      const activeAlerts = await this.prisma.rateAlert.findMany({ where: { active: true } });
      const triggered = this.evaluator.evaluate(prevSnapshot?.rate ?? null, fetched.rate, activeAlerts);

      await Promise.all(
        triggered.map((t) =>
          this.prisma.rateAlert.update({
            where: { id: t.alertId },
            data: { lastTriggeredAt: new Date(), lastTriggeredRate: t.rate.toFixed(8) },
          }),
        ),
      );
    } catch (error) {
      // Same contract as the fetch failure above: a snapshot-write or
      // alert-evaluation error must not crash the app or a caller awaiting
      // onModuleInit. The next scheduled run (or bootstrap) retries.
      this.logger.error(`Rate snapshot write/evaluation failed: ${String(error)}`);
    }
  }
}

function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
