import { describe, expect, it } from 'vitest'
import { convertJpyToVnd, convertVndToJpy } from './exchange-math'

describe('exchange-math', () => {
  const rate = 168.434476

  it('converts JPY to VND by multiplying by the rate', () => {
    expect(convertJpyToVnd(1000, rate)).toBeCloseTo(168434.476, 3)
  })

  it('converts VND to JPY by dividing by the rate', () => {
    expect(convertVndToJpy(168434.476, rate)).toBeCloseTo(1000, 6)
  })

  it('round-trips within floating-point tolerance', () => {
    const jpy = 50_000
    const vnd = convertJpyToVnd(jpy, rate)
    expect(convertVndToJpy(vnd, rate)).toBeCloseTo(jpy, 6)
  })

  it('returns 0 for a 0 amount in either direction', () => {
    expect(convertJpyToVnd(0, rate)).toBe(0)
    expect(convertVndToJpy(0, rate)).toBe(0)
  })

  it('handles a very large amount without overflowing to Infinity', () => {
    const largeJpy = 1_000_000_000
    const vnd = convertJpyToVnd(largeJpy, rate)
    expect(Number.isFinite(vnd)).toBe(true)
    expect(convertVndToJpy(vnd, rate)).toBeCloseTo(largeJpy, 3)
  })
})
