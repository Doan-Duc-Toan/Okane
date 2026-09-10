import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { Observable, map } from 'rxjs';

/**
 * Prisma's Decimal does not survive JSON.stringify as a number (and must not —
 * binary floats cannot represent money). This interceptor walks every response
 * body and turns Decimal instances into fixed-scale strings, so money is
 * transported as "1500000.00" and formatted client-side with Intl.NumberFormat.
 *
 * decimal.js's plain `toString()` strips trailing zeros ("1500000.00" ->
 * "1500000"), which breaks the frozen money-string contract, so scale must be
 * applied explicitly with `toFixed(n)`. Money columns in this schema are
 * Decimal(18,2); FX-rate columns are Decimal(20,8) (see docs/data-model.md).
 * A field-name allowlist decides which scale applies — every rate-carrying
 * field must be added here, or it silently truncates to 2dp.
 *
 * An explicit interceptor is preferred over patching Decimal.prototype.toJSON
 * globally — the prototype patch is invisible action at a distance.
 */
const RATE_FIELD_SCALE = 8;
const MONEY_FIELD_SCALE = 2;
const RATE_FIELD_NAMES = new Set([
  'rate',
  'fxRateUsed',
  'rateUsed',
  'threshold',
  'lastTriggeredRate',
]);

@Injectable()
export class DecimalSerializerInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((body) => serializeDecimals(body)));
  }
}

function serializeDecimals(value: unknown, fieldName?: string): unknown {
  // `Decimal.isDecimal()` (not `instanceof Decimal`) — Prisma's query engine
  // constructs Decimal values through its own bundled copy of decimal.js,
  // which is not always the same class reference this file imports from
  // `@prisma/client/runtime/library`. `instanceof` silently failed against
  // real query results (proven live: a rate-alert's `threshold` came back as
  // the raw internal `{s, e, d}` shape instead of a fixed-scale string), so
  // every Decimal in every response fell through to the generic object
  // branch below and leaked decimal.js internals. `isDecimal` duck-types
  // across bundled copies and is the check decimal.js itself recommends for
  // exactly this situation.
  if (Decimal.isDecimal(value)) {
    const scale = fieldName && RATE_FIELD_NAMES.has(fieldName) ? RATE_FIELD_SCALE : MONEY_FIELD_SCALE;
    return (value as InstanceType<typeof Decimal>).toFixed(scale);
  }
  if (Array.isArray(value)) {
    return value.map((item) => serializeDecimals(item, fieldName));
  }
  if (value instanceof Date) {
    return value;
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = serializeDecimals(val, key);
    }
    return result;
  }
  return value;
}
