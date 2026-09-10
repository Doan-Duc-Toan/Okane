import { ApiError, apiClient } from '@/lib/api-client'
import type {
  ConvertResponse,
  CreateAlertPayload,
  Currency,
  CurrentRate,
  HistoryRange,
  HistoryResult,
  RateAlert,
  UpdateAlertPayload,
} from './exchange.types'

export const exchangeApi = {
  /**
   * A 404 here means "no snapshot collected yet" (fresh deploy, or the daily
   * cron hasn't run once) — a real, expected empty state per Phase 5's
   * contract, not a failure to retry or surface as a crash.
   */
  getCurrent: async (): Promise<CurrentRate | null> => {
    try {
      return await apiClient.get<CurrentRate>('/rates/current')
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null
      throw err
    }
  },

  getHistory: (range: HistoryRange) => apiClient.get<HistoryResult>(`/rates/history?range=${range}`),

  /**
   * Exists for the future mobile client and for verification — the web
   * converter mirrors this formula locally rather than round-tripping per
   * keystroke (see exchange-math.ts).
   */
  convert: (amount: string, from: Currency, to: Currency) =>
    apiClient.post<ConvertResponse>('/rates/convert', { amount, from, to }),

  listAlerts: () => apiClient.get<RateAlert[]>('/rate-alerts'),
  createAlert: (payload: CreateAlertPayload) => apiClient.post<RateAlert>('/rate-alerts', payload),
  updateAlert: (id: string, payload: UpdateAlertPayload) =>
    apiClient.patch<RateAlert>(`/rate-alerts/${id}`, payload),
  deleteAlert: (id: string) => apiClient.delete<void>(`/rate-alerts/${id}`),
}
