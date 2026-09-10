import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { exchangeApi } from '../exchange.api'
import type { HistoryRange } from '../exchange.types'

export const rateHistoryQueryKey = (range: HistoryRange) => ['rate', 'history', range] as const

/** `keepPreviousData` avoids a chart flash to empty while a new range loads. */
export function useRateHistory(range: HistoryRange) {
  return useQuery({
    queryKey: rateHistoryQueryKey(range),
    queryFn: () => exchangeApi.getHistory(range),
    placeholderData: keepPreviousData,
  })
}
