import { describe, expect, it } from 'vitest'
import type { AvailableBalanceResponse } from '../budget.types'
import { resolveCardState } from './available-balance-state'

const configuredBase = {
  configured: true as const,
  budgetCurrency: 'JPY' as const,
  monthlyIncome: '300000',
  totalFixedExpenses: '150000',
  totalGoalNeed: '0',
  rateUsed: null,
  rateAsOf: null,
  rateUnavailable: false,
  allocation: null,
  counted: [],
  excluded: [],
}

describe('resolveCardState', () => {
  it('resolves to unconfigured when the budget has not been set up', () => {
    const data: AvailableBalanceResponse = { configured: false }
    expect(resolveCardState(data)).toBe('unconfigured')
  })

  it('resolves to rateUnavailable even when available/shortfall are also present', () => {
    const data: AvailableBalanceResponse = {
      ...configuredBase,
      rateUnavailable: true,
      available: null,
      shortfall: '10000',
    }
    expect(resolveCardState(data)).toBe('rateUnavailable')
  })

  it('resolves to positive when available is zero (the >= 0 boundary)', () => {
    const data: AvailableBalanceResponse = { ...configuredBase, available: '0', shortfall: null }
    expect(resolveCardState(data)).toBe('positive')
  })

  it('resolves to positive when shortfall is exactly zero, not shortfall', () => {
    const data: AvailableBalanceResponse = { ...configuredBase, available: '0', shortfall: '0' }
    expect(resolveCardState(data)).toBe('positive')
  })

  it('resolves to shortfall when shortfall is a positive amount', () => {
    const data: AvailableBalanceResponse = { ...configuredBase, available: null, shortfall: '25000' }
    expect(resolveCardState(data)).toBe('shortfall')
  })
})
