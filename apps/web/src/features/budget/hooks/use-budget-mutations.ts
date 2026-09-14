import { useMutation, useQueryClient } from '@tanstack/react-query'
import { budgetApi } from '../budget.api'
import type { UpdateBudgetPayload } from '../budget.types'
import { availableBalanceQueryKey } from './use-available-balance'
import { budgetQueryKey } from './use-budget'

export function useUpdateBudget() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: UpdateBudgetPayload) => budgetApi.updateBudget(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: budgetQueryKey })
      // Changing income/expenses changes the available-balance math too.
      void queryClient.invalidateQueries({ queryKey: availableBalanceQueryKey })
    },
  })
}
