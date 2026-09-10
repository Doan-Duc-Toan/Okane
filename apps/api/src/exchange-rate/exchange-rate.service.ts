import { Injectable } from '@nestjs/common';
import { Currency } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import type { RateProvider } from '../common/rate-provider.interface.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { HistoryRange } from './dto/history-query.dto.js';

const RANGE_DAYS: Record<HistoryRange, number> = { '7d': 7, '30d': 30, '1y': 365 };
const MS_PER_DAY = 86_400_000;

export interface CurrentRate {
  rate: Decimal;
  base: Currency;
  quote: Currency;
  asOf: string;
  isStale: boolean;
  source: string;
}

export interface HistoryPoint {
  date: string;
  rate: Decimal;
}

export interface HistoryResult {
  range: HistoryRange;
  points: HistoryPoint[];
  pointCount: number;
  coverage: 'partial' | 'full';
}

/**
 * Read path only — no outbound HTTP here (that's RateProviderClient, called
 * only by the cron/bootstrap). Implements RateProvider so Phase 4's
 * GoalsService/SavingsEntriesService can depend on this directly once wired
 * via RateProviderModule.
 */
@Injectable()
export class ExchangeRateService implements RateProvider {
  constructor(private readonly prisma: PrismaService) {}

  async getLatestRate(): Promise<Decimal | null> {
    const snapshot = await this.getLatestSnapshot();
    return snapshot?.rate ?? null;
  }

  async getLatestRateAsOf(): Promise<string | null> {
    const snapshot = await this.getLatestSnapshot();
    return snapshot ? toDateString(snapshot.capturedOn) : null;
  }

  async getCurrent(): Promise<CurrentRate | null> {
    const snapshot = await this.getLatestSnapshot();
    if (!snapshot) return null;

    const todayUtc = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
    const capturedUtc = Date.UTC(
      snapshot.capturedOn.getUTCFullYear(),
      snapshot.capturedOn.getUTCMonth(),
      snapshot.capturedOn.getUTCDate(),
    );
    const isStale = capturedUtc < todayUtc - MS_PER_DAY;

    return {
      rate: snapshot.rate,
      base: snapshot.base,
      quote: snapshot.quote,
      asOf: toDateString(snapshot.capturedOn),
      isStale,
      source: snapshot.source,
    };
  }

  async getHistory(range: HistoryRange): Promise<HistoryResult> {
    const days = RANGE_DAYS[range];
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - days);

    const snapshots = await this.prisma.rateSnapshot.findMany({
      where: { base: Currency.JPY, quote: Currency.VND, capturedOn: { gte: since } },
      orderBy: { capturedOn: 'asc' },
    });

    return {
      range,
      points: snapshots.map((s) => ({ date: toDateString(s.capturedOn), rate: s.rate })),
      pointCount: snapshots.length,
      // A real gap and "history hasn't accumulated yet" look the same from
      // point count alone, which is fine — both mean "don't treat this as a
      // complete picture" and the UI's copy for "partial" covers either case.
      coverage: snapshots.length >= days ? 'full' : 'partial',
    };
  }

  private async getLatestSnapshot() {
    return this.prisma.rateSnapshot.findFirst({
      where: { base: Currency.JPY, quote: Currency.VND },
      orderBy: { capturedOn: 'desc' },
    });
  }
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}
