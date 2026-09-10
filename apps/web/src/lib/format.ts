/**
 * Money, rate, and date formatting.
 *
 * Money amounts travel through this app as strings end to end (API and
 * component props alike) — never cast to Number before formatting, since a
 * float cast can lose precision on large or many-decimal amounts. Intl
 * APIs accept numeric strings directly, so we lean on that rather than a
 * manual parse.
 */

export type MoneyCurrency = 'JPY' | 'VND'

const LOCALE_BY_LANG: Record<string, string> = {
  vi: 'vi-VN',
  ja: 'ja-JP',
}

function resolveLocale(locale: string): string {
  return LOCALE_BY_LANG[locale] ?? locale
}

/**
 * Guards against a value that isn't a numeric string or plain number — e.g.
 * a Prisma/decimal.js Decimal instance serialized raw over JSON as
 * `{ s, e, d }` instead of `.toString()`'d server-side. That is a backend
 * contract bug (Phase 4's frozen contract promises a string), not something
 * this layer can reconstruct without importing decimal.js's internal
 * format — so it fails loudly to the console and visibly as "—" rather
 * than crashing the page or silently displaying a wrong number.
 */
function isFormattableNumeric(value: unknown): value is string | number {
  if (typeof value === 'number') return true
  if (typeof value !== 'string') return false
  return value.trim() !== '' && !Number.isNaN(Number(value))
}

/** Both JPY and VND are zero-decimal currencies. */
export function formatMoney(value: string, currency: MoneyCurrency, locale = 'vi'): string {
  if (!isFormattableNumeric(value)) {
    console.error('formatMoney received a non-numeric value (API contract violation):', value)
    return '—'
  }
  const formatter = new Intl.NumberFormat(resolveLocale(locale), {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  })
  return formatter.format(value as unknown as number)
}

/** Rates render with tabular figures and a handful of significant decimals. */
export function formatRate(value: string, locale = 'vi'): string {
  if (!isFormattableNumeric(value)) {
    console.error('formatRate received a non-numeric value (API contract violation):', value)
    return '—'
  }
  const formatter = new Intl.NumberFormat(resolveLocale(locale), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })
  return formatter.format(value as unknown as number)
}

export function formatDate(iso: string | null | undefined, locale = 'vi'): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    console.error('formatDate received an unparseable value:', iso)
    return '—'
  }
  const formatter = new Intl.DateTimeFormat(resolveLocale(locale), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
  return formatter.format(date)
}
