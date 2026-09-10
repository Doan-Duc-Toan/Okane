import { Injectable } from '@nestjs/common';
import type { RateProvider } from './rate-provider.interface.js';

/**
 * Placeholder RATE_PROVIDER binding used until Phase 5's ExchangeRateService
 * is wired in. Returning null means "no rate available": same-currency entry
 * logging still works, and cross-currency logging correctly surfaces a 503
 * instead of writing an unconverted (and therefore corrupt) amount.
 */
@Injectable()
export class StubRateProvider implements RateProvider {
  async getLatestRate(): Promise<null> {
    return null;
  }

  async getLatestRateAsOf(): Promise<null> {
    return null;
  }
}
