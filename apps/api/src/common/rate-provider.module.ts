import { Module } from '@nestjs/common';
import { ExchangeRateModule } from '../exchange-rate/exchange-rate.module.js';
import { ExchangeRateService } from '../exchange-rate/exchange-rate.service.js';
import { RATE_PROVIDER } from './rate-provider.interface.js';

/**
 * Single seam for the Phase 4 <-> Phase 5 soft dependency: GoalsModule and
 * SavingsEntriesModule both import this rather than binding RATE_PROVIDER
 * themselves. Phase 4 built and tested against StubRateProvider; now that
 * Phase 5 exists, this is the one file that swaps the binding to the real
 * ExchangeRateService (which implements the same RateProvider interface) —
 * no consumer had to change.
 */
@Module({
  imports: [ExchangeRateModule],
  providers: [{ provide: RATE_PROVIDER, useExisting: ExchangeRateService }],
  exports: [RATE_PROVIDER],
})
export class RateProviderModule {}
