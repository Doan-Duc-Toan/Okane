import { useQuery } from '@tanstack/react-query'
import { budgetApi } from '../budget.api'

export const budgetQueryKey = ['budget'] as const

export function useBudget() {
  return useQuery({
    queryKey: budgetQueryKey,
    queryFn: budgetApi.getBudget,
  })
}
