import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { goalsApi } from '../goals.api'

export const goalQueryKey = (id: string) => ['goal', id] as const
export const entriesQueryKey = (id: string) => ['entries', id] as const

export function useGoal(id: string) {
  return useQuery({
    queryKey: goalQueryKey(id),
    queryFn: () => goalsApi.getGoal(id),
  })
}

/** Cursor-paginated entry history — "Load more" fetches the next page. */
export function useEntries(id: string) {
  return useInfiniteQuery({
    queryKey: entriesQueryKey(id),
    queryFn: ({ pageParam }: { pageParam: string | undefined }) => goalsApi.listEntries(id, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })
}
