import { Injectable } from '@nestjs/common';
import { Currency } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * Pure converter — no Prisma, no HTTP. `rate` is always the JPY->VND rate,
 * injected by the caller. Both JPY and VND are zero-decimal currencies in
 * practice, so converted amounts are rounded to 0 decimal places for display
 * (this is a UI-facing convention distinct from the 2dp storage scale used
 * for Goal/SavingsEntry amounts — see docs/data-model.md).
 */
@Injectable()
export class RateConverterService {
  convert(amount: Decimal, from: Currency, to: Currency, rate: Decimal | null): Decimal | null {
    if (from === to) return amount.toDecimalPlaces(0);
    if (!rate) return null;

    const converted = from === Currency.JPY ? amount.times(rate) : amount.dividedBy(rate);
    return converted.toDecimalPlaces(0);
  }
}
