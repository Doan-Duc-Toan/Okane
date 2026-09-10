import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Decimal } from '@prisma/client/runtime/library';

export interface FetchedRate {
  rate: Decimal;
  providerUpdatedAt: string;
  source: string;
}

interface ProviderResponse {
  result?: string;
  base_code?: string;
  time_last_update_utc?: string;
  rates?: Record<string, number>;
}

const TIMEOUT_MS = 10_000;
const RETRY_DELAYS_MS = [2_000, 6_000];

/**
 * HTTP client for open.er-api.com. Validates the payload rather than trusting
 * it — a silently malformed response would poison RateSnapshot permanently,
 * since there's no paid backfill source to correct it later.
 */
@Injectable()
export class RateProviderClient {
  private readonly logger = new Logger(RateProviderClient.name);

  constructor(private readonly config: ConfigService) {}

  async fetchJpyVnd(): Promise<FetchedRate> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        return await this.fetchOnce();
      } catch (error) {
        lastError = error;
        const delay = RETRY_DELAYS_MS[attempt];
        if (delay === undefined) break;
        this.logger.warn(`Rate fetch attempt ${attempt + 1} failed, retrying in ${delay}ms: ${String(error)}`);
        await sleep(delay);
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Rate fetch failed');
  }

  private async fetchOnce(): Promise<FetchedRate> {
    const url = this.config.get<string>('FX_API_URL', 'https://open.er-api.com/v6/latest/JPY');
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });

    if (!response.ok) {
      throw new Error(`Rate provider responded with HTTP ${response.status}`);
    }

    const body = (await response.json()) as ProviderResponse;
    if (body.result !== 'success') {
      throw new Error(`Rate provider result was not "success": ${String(body.result)}`);
    }
    if (body.base_code !== 'JPY') {
      throw new Error(`Rate provider base_code was not "JPY": ${String(body.base_code)}`);
    }
    const vnd = body.rates?.VND;
    if (typeof vnd !== 'number' || !Number.isFinite(vnd) || vnd <= 0) {
      throw new Error(`Rate provider rates.VND was not a positive number: ${String(vnd)}`);
    }

    return {
      rate: new Decimal(vnd),
      providerUpdatedAt: body.time_last_update_utc ?? new Date().toISOString(),
      source: 'open.er-api.com',
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
