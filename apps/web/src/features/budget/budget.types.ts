/** Types mirroring Phase 3 (settings, available) and Phase 4 (split) frozen
 *  contracts. Money is always a string, matching goals.types.ts's convention. */

import type { Entry } from '@/features/goals/goals.types'

export type Currency = 'JPY' | 'VND'

export interface BudgetSettings {
  monthlyIncome: string
  expenseRent: string
  expenseFood: string
  expenseOther: string
  currency: Currency
}

export interface BudgetResponse {
  configured: boolean
  settings: BudgetSettings | null
}

export interface UpdateBudgetPayload {
  monthlyIncome: string
  expenseRent: string
  expenseFood: string
  expenseOther: string
  currency: Currency
}

export type ExcludedReason = 'no_deadline' | 'overdue' | 'completed'

export interface CountedGoal {
  goalId: string
  name: string
  goalCurrency: Currency
  needInGoalCurrency: string
  needInBudgetCurrency: string
  deadline: string
}

export interface ExcludedGoal {
  goalId: string
  name: string
  reason: ExcludedReason
}

export interface AllocationLine {
  goalId: string
  name: string
  amount: string
  needInBudgetCurrency: string
  coveredFully: boolean
}

export interface AvailableBalanceUnconfigured {
  configured: false
}

export interface AvailableBalanceConfigured {
  configured: true
  budgetCurrency: Currency
  monthlyIncome: string
  totalFixedExpenses: string
  totalGoalNeed: string
  available: string | null
  shortfall: string | null
  counted: CountedGoal[]
  excluded: ExcludedGoal[]
  rateUsed: string | null
  rateAsOf: string | null
  rateUnavailable: boolean
  /** Already sorted nearest-deadline-first by the server — never re-sort client-side. */
  allocation: AllocationLine[] | null
}

export type AvailableBalanceResponse = AvailableBalanceUnconfigured | AvailableBalanceConfigured

export interface SplitAllocationInput {
  goalId: string
  amount: string
  currency: Currency
}

export interface SplitEntryPayload {
  entryDate: string
  note?: string
  allocations: SplitAllocationInput[]
}

export interface SplitEntryResponse {
  entries: Entry[]
}

/** The shape `AllocationSuggestion`'s Apply button hands to `/split` via
 *  router state, and `SplitForm` reads back to pre-fill — kept as one named
 *  type so the two ends of this contract can't silently drift apart. */
export interface SplitRouterState {
  allocations: { goalId: string; amount: string }[]
  currency: Currency
}
