import { useMutation, useQueryClient } from '@tanstack/react-query'
import { goalsApi } from '../goals.api'
import type { CreateGoalPayload, UpdateGoalPayload } from '../goals.types'
import { dashboardQueryKey } from './use-dashboard'
import { goalQueryKey } from './use-goal'

export function useCreateGoal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateGoalPayload) => goalsApi.createGoal(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: dashboardQueryKey })
    },
  })
}

export function useUpdateGoal(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: UpdateGoalPayload) => goalsApi.updateGoal(id, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: goalQueryKey(id) })
      void queryClient.invalidateQueries({ queryKey: dashboardQueryKey })
    },
  })
}

export function useDeleteGoal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => goalsApi.deleteGoal(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: dashboardQueryKey })
    },
  })
}
