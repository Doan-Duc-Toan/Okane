/**
 * Parses flexible money input into a plain number: "1000000000",
 * "1,000,000,000", "1.000.000.000" (VN grouping), "1 tỷ" / "1ty" / "1b",
 * "1.5 triệu" / "1.5tr" / "1.5m", "500k" all resolve the same way a person
 * would read them. Returns null for anything that doesn't parse — the
 * caller's existing required/positive validation handles the empty/invalid
 * message, this only handles turning readable text into a number.
 */

const SHORTHAND_MULTIPLIERS: Array<[RegExp, number]> = [
  // Vietnamese + generic English magnitude words, longest/most specific first
  // so e.g. "trieu" doesn't get partially matched by a shorter pattern.
  [/^(ty|tỷ|billion|bn|b)$/i, 1_000_000_000],
  [/^(tr|trieu|triệu|million|mil|m)$/i, 1_000_000],
  [/^(k|nghin|nghìn|ngan|ngàn|thousand)$/i, 1_000],
  // Japanese magnitude words (man/oku), Latin-typed or kanji.
  [/^(oku|億)$/i, 100_000_000],
  [/^(man|万)$/i, 10_000],
]

export function parseFlexibleAmount(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  const match = /^([\d.,]+)\s*([a-zA-Zà-ỹ億万]*)$/.exec(trimmed)
  if (!match) return null
  const [, numberPart, suffixPart] = match

  let multiplier = 1
  if (suffixPart) {
    const found = SHORTHAND_MULTIPLIERS.find(([pattern]) => pattern.test(suffixPart))
    if (!found) return null // an unrecognized trailing word — treat as invalid, not silently ignored
    multiplier = found[1]
  }

  const normalized = normalizeGroupedNumber(numberPart)
  const value = Number(normalized)
  if (!Number.isFinite(value)) return null
  return value * multiplier
}

/**
 * "1,000,000" / "1.000.000" (thousands grouping, either separator) both
 * become "1000000". "1234.56" / "1234,56" (a genuine decimal — exactly one
 * separator with <=2 digits after it) are preserved as decimals. Mixed
 * "1.234.567,89" resolves by treating whichever separator appears LAST as
 * the decimal point.
 */
function normalizeGroupedNumber(raw: string): string {
  const hasDot = raw.includes('.')
  const hasComma = raw.includes(',')

  if (hasDot && hasComma) {
    const decimalChar = raw.lastIndexOf('.') > raw.lastIndexOf(',') ? '.' : ','
    const groupChar = decimalChar === '.' ? ',' : '.'
    return raw.split(groupChar).join('').replace(decimalChar, '.')
  }

  for (const sep of ['.', ','] as const) {
    if (!raw.includes(sep)) continue
    const parts = raw.split(sep)
    const looksDecimal = parts.length === 2 && parts[1].length <= 2
    return looksDecimal ? raw.replace(sep, '.') : parts.join('')
  }

  return raw
}

/** Plain-number string the API expects — no grouping, "." as the decimal point. */
export function toApiAmountString(value: number): string {
  return String(value)
}
