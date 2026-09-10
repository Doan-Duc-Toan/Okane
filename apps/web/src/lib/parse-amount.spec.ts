import { describe, expect, it } from 'vitest'
import { parseFlexibleAmount } from './parse-amount'

describe('parseFlexibleAmount', () => {
  it('parses a plain integer', () => {
    expect(parseFlexibleAmount('1000000000')).toBe(1_000_000_000)
  })

  it('parses comma-grouped input', () => {
    expect(parseFlexibleAmount('1,000,000,000')).toBe(1_000_000_000)
  })

  it('parses dot-grouped input (Vietnamese convention)', () => {
    expect(parseFlexibleAmount('1.000.000.000')).toBe(1_000_000_000)
  })

  it('parses a genuine decimal amount, not as thousands grouping', () => {
    expect(parseFlexibleAmount('1234.56')).toBe(1234.56)
    expect(parseFlexibleAmount('1234,56')).toBe(1234.56)
  })

  it('parses mixed grouping + decimal, last separator wins as the decimal point', () => {
    expect(parseFlexibleAmount('1.234.567,89')).toBe(1_234_567.89)
    expect(parseFlexibleAmount('1,234,567.89')).toBe(1_234_567.89)
  })

  it('parses Vietnamese billion/million/thousand shorthand', () => {
    expect(parseFlexibleAmount('1 tỷ')).toBe(1_000_000_000)
    expect(parseFlexibleAmount('1ty')).toBe(1_000_000_000)
    expect(parseFlexibleAmount('1.5 triệu')).toBe(1_500_000)
    expect(parseFlexibleAmount('1.5tr')).toBe(1_500_000)
    expect(parseFlexibleAmount('500k')).toBe(500_000)
  })

  it('parses generic English magnitude shorthand', () => {
    expect(parseFlexibleAmount('1b')).toBe(1_000_000_000)
    expect(parseFlexibleAmount('2.5m')).toBe(2_500_000)
  })

  it('parses Japanese man/oku shorthand', () => {
    expect(parseFlexibleAmount('100man')).toBe(1_000_000)
    expect(parseFlexibleAmount('1oku')).toBe(100_000_000)
    expect(parseFlexibleAmount('1万')).toBe(10_000)
    expect(parseFlexibleAmount('1億')).toBe(100_000_000)
  })

  it('is case-insensitive on shorthand suffixes', () => {
    expect(parseFlexibleAmount('1TY')).toBe(1_000_000_000)
    expect(parseFlexibleAmount('1B')).toBe(1_000_000_000)
  })

  it('returns null for empty or whitespace-only input', () => {
    expect(parseFlexibleAmount('')).toBeNull()
    expect(parseFlexibleAmount('   ')).toBeNull()
  })

  it('returns null for an unrecognized trailing word rather than silently ignoring it', () => {
    expect(parseFlexibleAmount('100 dollars')).toBeNull()
  })

  it('returns null for non-numeric input', () => {
    expect(parseFlexibleAmount('abc')).toBeNull()
  })
})
