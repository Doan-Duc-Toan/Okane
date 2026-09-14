import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { availableBalanceQueryKey } from '@/features/budget/hooks/use-available-balance'
import type { SplitEntryPayload, SplitEntryResponse } from '@/features/budget/budget.types'
import { dashboardQueryKey } from './use-dashboard'
import { goalQueryKey } from './use-goal'

/**
 * POST /entries/split lives outside goals.api.ts (out of this phase's file
 * scope, and budget.api.ts is explicitly scoped to only the three budget
 * endpoints) — called directly here instead.
 *
 * One split touches the dashboard, the available-balance card, and every
 * goal it allocated to — invalidate all of them explicitly, per the same
 * rule use-entry-mutations.ts already follows for single-goal entries.
 */
export function useSplitMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: SplitEntryPayload) => apiClient.post<SplitEntryResponse>('/entries/split', payload),
    onSuccess: (_response, variables) => {
      void queryClient.invalidateQueries({ queryKey: dashboardQueryKey })
      void queryClient.invalidateQueries({ queryKey: availableBalanceQueryKey })
      for (const allocation of variables.allocations) {
        void queryClient.invalidateQueries({ queryKey: goalQueryKey(allocation.goalId) })
      }
    },
  })
}
