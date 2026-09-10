import { Currency } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * Shared by GoalMathService (remaining-in-other-currency) and
 * SavingsEntriesService (freezing amountInGoalCurrency at log time).
 * JPY -> VND multiplies by the JPY->VND rate; VND -> JPY divides. Result is
 * rounded to the schema's 2dp money scale (Decimal(18,2)).
 */
export function convertAmount(amount: Decimal, fromCurrency: Currency, jpyToVndRate: Decimal): Decimal {
  const converted = fromCurrency === Currency.JPY ? amount.times(jpyToVndRate) : amount.dividedBy(jpyToVndRate);
  return converted.toDecimalPlaces(2);
}
