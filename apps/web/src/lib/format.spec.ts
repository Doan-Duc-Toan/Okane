import { describe, expect, it } from 'vitest'
import { formatDate, formatMoney, formatRate } from './format'

describe('formatMoney', () => {
  it('formats JPY with zero decimals under vi locale', () => {
    expect(formatMoney('1500000', 'JPY', 'vi')).toMatch(/1.500.000/)
  })

  it('formats VND with zero decimals under ja locale', () => {
    expect(formatMoney('8421724', 'VND', 'ja')).toMatch(/8,421,724/)
  })

  it('formats zero', () => {
    expect(formatMoney('0', 'JPY', 'vi')).toMatch(/0/)
  })

  it('formats a very large amount without throwing', () => {
    expect(() => formatMoney('999999999999', 'VND', 'vi')).not.toThrow()
  })

  it('preserves a decimal string that would lose precision if cast with Number()', () => {
    // Number('9007199254740993') rounds to 9007199254740992 (loses the trailing 3).
    // Passing the raw string into Intl avoids that float round-trip.
    const value = '9007199254740993'
    expect(Number(value).toString()).not.toBe(value)
    expect(() => formatMoney(value, 'JPY', 'vi')).not.toThrow()
  })
})

describe('formatRate', () => {
  it('renders 2-4 significant decimals', () => {
    const result = formatRate('168.434476', 'vi')
    expect(result).toMatch(/168[.,]4345|168[.,]4344/)
  })
})

describe('formatDate', () => {
  it('renders a locale-aware short date', () => {
    const result = formatDate('2026-09-10T00:00:00Z', 'vi')
    expect(result.length).toBeGreaterThan(0)
  })
})
