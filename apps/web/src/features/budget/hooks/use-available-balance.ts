import { useQuery } from '@tanstack/react-query'
import { budgetApi } from '../budget.api'

export const availableBalanceQueryKey = ['budget', 'available'] as const

/** Deliberately independent from `useBudget`/`useDashboard` — a failure here
 *  must only affect the dashboard card's own slot, never blank the rest of
 *  the dashboard (Phase 5's rule). */
export function useAvailableBalance() {
  return useQuery({
    queryKey: availableBalanceQueryKey,
    queryFn: budgetApi.getAvailableBalance,
  })
}
