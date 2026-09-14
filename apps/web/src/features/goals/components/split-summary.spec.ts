import { describe, expect, it } from 'vitest'
import { computeSplitSummary } from './split-summary'

describe('computeSplitSummary', () => {
  it('blocks submit when no row is filled', () => {
    const summary = computeSplitSummary({ a: '', b: '' }, '')
    expect(summary.canSubmit).toBe(false)
    expect(summary.filledCount).toBe(0)
  })

  it('allows submit with one filled row and no total set (no ceiling)', () => {
    const summary = computeSplitSummary({ a: '50000', b: '' }, '')
    expect(summary.canSubmit).toBe(true)
    expect(summary.leftToAllocate).toBeNull()
  })

  it('computes left-to-allocate as total minus the sum of filled rows', () => {
    const summary = computeSplitSummary({ a: '30000', b: '20000' }, '100000')
    expect(summary.sum).toBe(50000)
    expect(summary.leftToAllocate).toBe(50000)
    expect(summary.canSubmit).toBe(true)
  })

  it('blocks submit when the filled rows exceed the total', () => {
    const summary = computeSplitSummary({ a: '80000', b: '30000' }, '100000')
    expect(summary.overAllocated).toBe(true)
    expect(summary.canSubmit).toBe(false)
  })

  it('blocks submit when a filled row is zero or not a positive number', () => {
    const summary = computeSplitSummary({ a: '0', b: '' }, '')
    expect(summary.canSubmit).toBe(false)
  })

  it('ignores an unparseable row for the sum but still blocks submit', () => {
    const summary = computeSplitSummary({ a: 'abc', b: '10000' }, '')
    expect(summary.canSubmit).toBe(false)
    expect(Number.isFinite(summary.sum)).toBe(true)
  })

  it('blocks submit past the 20-allocation cap', () => {
    const amounts = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`goal-${i}`, '1000']))
    const summary = computeSplitSummary(amounts, '')
    expect(summary.filledCount).toBe(21)
    expect(summary.canSubmit).toBe(false)
  })

  it('treats a total exactly equal to the sum as not over-allocated', () => {
    const summary = computeSplitSummary({ a: '100000' }, '100000')
    expect(summary.overAllocated).toBe(false)
    expect(summary.leftToAllocate).toBe(0)
    expect(summary.canSubmit).toBe(true)
  })
})
