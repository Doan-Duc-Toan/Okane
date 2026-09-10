import { useMutation, useQueryClient } from '@tanstack/react-query'
import { goalsApi } from '../goals.api'
import type { CreateEntryPayload, UpdateEntryPayload } from '../goals.types'
import { dashboardQueryKey } from './use-dashboard'
import { entriesQueryKey, goalQueryKey } from './use-goal'

/**
 * One entry mutation moves three views at once: the goal (progress), its
 * entry list, and the dashboard totals. Invalidate all three explicitly
 * rather than clearing the whole cache (Phase 8's rule).
 */
function invalidateEntryViews(
  queryClient: ReturnType<typeof useQueryClient>,
  goalId: string,
) {
  void queryClient.invalidateQueries({ queryKey: goalQueryKey(goalId) })
  void queryClient.invalidateQueries({ queryKey: entriesQueryKey(goalId) })
  void queryClient.invalidateQueries({ queryKey: dashboardQueryKey })
}

export function useCreateEntry(goalId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateEntryPayload) => goalsApi.createEntry(goalId, payload),
    onSuccess: () => invalidateEntryViews(queryClient, goalId),
  })
}

export function useUpdateEntry(goalId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateEntryPayload }) =>
      goalsApi.updateEntry(id, payload),
    onSuccess: () => invalidateEntryViews(queryClient, goalId),
  })
}

export function useDeleteEntry(goalId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => goalsApi.deleteEntry(id),
    onSuccess: () => invalidateEntryViews(queryClient, goalId),
  })
}
