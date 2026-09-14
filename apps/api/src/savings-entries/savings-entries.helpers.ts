import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { convertAmount } from '../common/currency-conversion.js';
import type { RateProvider } from '../common/rate-provider.interface.js';
import type { SplitAllocationDto } from './dto/create-split.dto.js';

/**
 * Pure helpers with no Prisma/rate dependency, extracted out of
 * SavingsEntriesService to keep that file under this repo's 200-line house
 * limit. Every check here runs before the service touches the database.
 */

export function parseEntryDate(entryDate: string): Date {
  const date = new Date(entryDate);
  const todayUtc = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
  const entryUtc = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  if (entryUtc > todayUtc) {
    throw new BadRequestException('entryDateFuture');
  }
  return date;
}

export function validateSplitAllocations(allocations: SplitAllocationDto[]): Decimal[] {
  const goalIds = allocations.map((allocation) => allocation.goalId);
  if (new Set(goalIds).size !== goalIds.length) {
    throw new BadRequestException('splitDuplicateGoal');
  }

  const amounts = allocations.map((allocation) => new Decimal(allocation.amount));
  if (amounts.some((amount) => !amount.greaterThan(0))) {
    throw new BadRequestException('splitAmountInvalid');
  }

  return amounts;
}

/**
 * Resolves amountInGoalCurrency + fxRateUsed for a (possibly cross-currency)
 * amount. `prefetchedRate` lets createSplit share one rate fetch across an
 * entire split instead of fetching once per allocation; create()/update()
 * never pass it, so their behavior is unchanged. Takes `rateProvider`
 * explicitly rather than reading it off a service instance — this needs
 * nothing else from SavingsEntriesService, so it lives here instead of as a
 * private method.
 */
export async function freezeEntryAmount(
  rateProvider: RateProvider,
  amount: Decimal,
  entryCurrency: 'JPY' | 'VND',
  goalCurrency: 'JPY' | 'VND',
  prefetchedRate?: Decimal,
): Promise<{ amountInGoalCurrency: Decimal; fxRateUsed: Decimal | null }> {
  if (entryCurrency === goalCurrency) {
    return { amountInGoalCurrency: amount, fxRateUsed: null };
  }

  const rate = prefetchedRate ?? (await rateProvider.getLatestRate());
  if (!rate) {
    // Never write an unconverted amount into a different currency's total —
    // that would corrupt the goal by a factor of ~168 (JPY/VND ratio).
    throw new ServiceUnavailableException('No exchange rate available yet — try again shortly');
  }

  return { amountInGoalCurrency: convertAmount(amount, entryCurrency, rate), fxRateUsed: rate };
}
