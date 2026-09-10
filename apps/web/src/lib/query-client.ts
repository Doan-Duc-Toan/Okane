import { QueryClient } from '@tanstack/react-query'

/**
 * staleTime 30s: dashboard/goal data doesn't need to feel "live" — it's a
 * savings tracker, not a stock ticker. retry:1: fail fast so ErrorState
 * shows up instead of a long spinner. refetchOnWindowFocus disabled: an FX
 * page that silently refetches on every tab focus is noise given a rate
 * that moves once a day (Phase 9's premise).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})
