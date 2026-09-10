import { Module } from '@nestjs/common';
import { RATE_PROVIDER } from './rate-provider.interface.js';
import { StubRateProvider } from './stub-rate-provider.js';

/**
 * Single seam for the Phase 4 <-> Phase 5 soft dependency: GoalsModule and
 * SavingsEntriesModule both import this rather than binding RATE_PROVIDER
 * themselves, so wiring in the real ExchangeRateService (Phase 5) is a
 * one-file change here instead of touching every consumer.
 */
@Module({
  providers: [{ provide: RATE_PROVIDER, useClass: StubRateProvider }],
  exports: [RATE_PROVIDER],
})
export class RateProviderModule {}
