import { useQuery } from '@tanstack/react-query'
import { exchangeApi } from '../exchange.api'

/**
 * Shared query key: the app-shell ticker, the dashboard, and the exchange
 * page all read this same cache entry, so no matter how many of them are
 * mounted, exactly one `/rates/current` request goes out (Phase 9's Success
 * Criteria). `staleTime` 5 minutes — the source moves once a day.
 */
export const currentRateQueryKey = ['rate', 'current'] as const

export function useCurrentRate() {
  return useQuery({
    queryKey: currentRateQueryKey,
    queryFn: exchangeApi.getCurrent,
    staleTime: 5 * 60_000,
  })
}
