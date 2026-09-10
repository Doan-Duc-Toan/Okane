import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { RATE_PROVIDER, type RateProvider } from '../common/rate-provider.interface.js';
import { convertAmount } from '../common/currency-conversion.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateEntryDto } from './dto/create-entry.dto.js';
import type { UpdateEntryDto } from './dto/update-entry.dto.js';

const DEFAULT_PAGE_SIZE = 50;

/**
 * Every method is userId-scoped per the Phase 2 isolation contract. Entry
 * creation freezes amountInGoalCurrency/fxRateUsed at logging time — see
 * docs/data-model.md for why that must never be recomputed from a later rate.
 */
@Injectable()
export class SavingsEntriesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(RATE_PROVIDER) private readonly rateProvider: RateProvider,
  ) {}

  async create(userId: string, goalId: string, dto: CreateEntryDto) {
    const goal = await this.prisma.goal.findFirst({ where: { id: goalId, userId } });
    if (!goal) throw new NotFoundException('goalNotFound');

    const entryDate = parseEntryDate(dto.entryDate);
    const amount = new Decimal(dto.amount);
    if (!amount.greaterThan(0)) {
      throw new BadRequestException('entryAmountInvalid');
    }

    const { amountInGoalCurrency, fxRateUsed } = await this.freeze(amount, dto.currency, goal.currency);

    return this.prisma.savingsEntry.create({
      data: {
        userId,
        goalId,
        amount: dto.amount,
        currency: dto.currency,
        amountInGoalCurrency,
        fxRateUsed,
        entryDate,
        note: dto.note,
      },
    });
  }

  async listForGoal(
    userId: string,
    goalId: string,
    limit: number,
    cursor?: string,
  ): Promise<{ entries: unknown[]; nextCursor: string | null }> {
    const goal = await this.prisma.goal.findFirst({ where: { id: goalId, userId }, select: { id: true } });
    if (!goal) throw new NotFoundException('goalNotFound');

    const pageSize = Math.min(limit, DEFAULT_PAGE_SIZE);
    // Fetch one extra row to know whether another page exists, per the
    // frozen `?limit=&cursor=` contract (phase-04's endpoint table) — the
    // response shape is `{ entries, nextCursor }`, not a bare array.
    const rows = await this.prisma.savingsEntry.findMany({
      where: { goalId, userId },
      orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
      take: pageSize + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    const hasMore = rows.length > pageSize;
    const entries = hasMore ? rows.slice(0, pageSize) : rows;
    const nextCursor = hasMore ? entries[entries.length - 1].id : null;

    return { entries, nextCursor };
  }

  async update(userId: string, id: string, dto: UpdateEntryDto) {
    const entry = await this.prisma.savingsEntry.findFirst({
      where: { id, userId },
      include: { goal: { select: { currency: true } } },
    });
    if (!entry) throw new NotFoundException('entryNotFound');

    const entryDate = dto.entryDate !== undefined ? parseEntryDate(dto.entryDate) : undefined;
    const nextAmount = dto.amount !== undefined ? new Decimal(dto.amount) : entry.amount;
    const nextCurrency = dto.currency ?? entry.currency;

    const amountOrCurrencyChanged = dto.amount !== undefined || dto.currency !== undefined;
    const frozen = amountOrCurrencyChanged
      ? await this.freeze(nextAmount, nextCurrency, entry.goal.currency)
      : undefined;

    const result = await this.prisma.savingsEntry.updateMany({
      where: { id, userId },
      data: {
        ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
        ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
        ...(entryDate !== undefined ? { entryDate } : {}),
        ...(dto.note !== undefined ? { note: dto.note } : {}),
        ...(frozen ? { amountInGoalCurrency: frozen.amountInGoalCurrency, fxRateUsed: frozen.fxRateUsed } : {}),
      },
    });
    if (result.count === 0) throw new NotFoundException('entryNotFound');

    return this.prisma.savingsEntry.findFirst({ where: { id, userId } });
  }

  async remove(userId: string, id: string): Promise<void> {
    const result = await this.prisma.savingsEntry.deleteMany({ where: { id, userId } });
    if (result.count === 0) throw new NotFoundException('entryNotFound');
  }

  /** Resolves amountInGoalCurrency + fxRateUsed for a (possibly cross-currency) amount. */
  private async freeze(
    amount: Decimal,
    entryCurrency: 'JPY' | 'VND',
    goalCurrency: 'JPY' | 'VND',
  ): Promise<{ amountInGoalCurrency: Decimal; fxRateUsed: Decimal | null }> {
    if (entryCurrency === goalCurrency) {
      return { amountInGoalCurrency: amount, fxRateUsed: null };
    }

    const rate = await this.rateProvider.getLatestRate();
    if (!rate) {
      // Never write an unconverted amount into a different currency's total
      // — that would corrupt the goal by a factor of ~168 (JPY/VND ratio).
      throw new ServiceUnavailableException('No exchange rate available yet — try again shortly');
    }

    return { amountInGoalCurrency: convertAmount(amount, entryCurrency, rate), fxRateUsed: rate };
  }
}

function parseEntryDate(entryDate: string): Date {
  const date = new Date(entryDate);
  const todayUtc = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
  const entryUtc = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  if (entryUtc > todayUtc) {
    throw new BadRequestException('entryDateFuture');
  }
  return date;
}
