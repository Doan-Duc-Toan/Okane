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

/** Both JPY and VND are zero-decimal currencies. */
export function formatMoney(value: string, currency: MoneyCurrency, locale = 'vi'): string {
  const formatter = new Intl.NumberFormat(resolveLocale(locale), {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  })
  return formatter.format(value as unknown as number)
}

/** Rates render with tabular figures and a handful of significant decimals. */
export function formatRate(value: string, locale = 'vi'): string {
  const formatter = new Intl.NumberFormat(resolveLocale(locale), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })
  return formatter.format(value as unknown as number)
}

export function formatDate(iso: string, locale = 'vi'): string {
  const formatter = new Intl.DateTimeFormat(resolveLocale(locale), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
  return formatter.format(new Date(iso))
}
