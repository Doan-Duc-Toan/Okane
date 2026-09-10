import type { Decimal } from '@prisma/client/runtime/library';

export const RATE_PROVIDER = Symbol('RATE_PROVIDER');

/**
 * Minimal port GoalsService and SavingsEntriesService depend on for the live
 * JPY->VND rate. This was the plan's documented "soft dependency" on Phase 5:
 * `getLatestRate()` is the one frozen signature Phase 4 needed, so it was
 * built and tested against a stub (always null) independently of Phase 5
 * existing. `getLatestRateAsOf()` is an additive convenience used only to
 * annotate the progress block's `rateAsOf` display field. Now that Phase 5
 * exists, ExchangeRateService implements this interface for real and is
 * bound to RATE_PROVIDER in rate-provider.module.ts.
 */
export interface RateProvider {
  /** JPY -> VND rate, or null when no rate is available yet. */
  getLatestRate(): Promise<Decimal | null>;
  /** UTC date (YYYY-MM-DD) the current rate was captured on, or null. */
  getLatestRateAsOf(): Promise<string | null>;
}
