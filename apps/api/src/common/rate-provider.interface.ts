import type { Decimal } from '@prisma/client/runtime/library';

export const RATE_PROVIDER = Symbol('RATE_PROVIDER');

/**
 * Minimal port GoalsService and SavingsEntriesService depend on for the live
 * JPY->VND rate. This is the plan's documented "soft dependency" on Phase 5:
 * `getLatestRate()` is the one frozen signature Phase 4 needs, so it builds
 * and tests against StubRateProvider independently of Phase 5 existing.
 * `getLatestRateAsOf()` is an additive convenience (used only to annotate the
 * progress block's `rateAsOf` display field) — both default to null in the
 * stub. Phase 5's ExchangeRateService satisfies this interface for real and
 * is wired in by swapping the provider binding (see exchange-rate.module.ts).
 */
export interface RateProvider {
  /** JPY -> VND rate, or null when no rate is available yet. */
  getLatestRate(): Promise<Decimal | null>;
  /** UTC date (YYYY-MM-DD) the current rate was captured on, or null. */
  getLatestRateAsOf(): Promise<string | null>;
}
