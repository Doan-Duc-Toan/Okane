/** Types mirroring Phase 5's frozen `/rates/*` and `/rate-alerts` contract. */

export type Currency = 'JPY' | 'VND'
export type HistoryRange = '7d' | '30d' | '1y'
export type AlertDirection = 'ABOVE' | 'BELOW'

export interface CurrentRate {
  rate: string
  base: Currency
  quote: Currency
  asOf: string
  isStale: boolean
  source: string
}

export interface HistoryPoint {
  date: string
  rate: string
}

export interface HistoryResult {
  range: HistoryRange
  points: HistoryPoint[]
  pointCount: number
  coverage: 'partial' | 'full'
}

export interface ConvertResponse {
  amount: string
  from: Currency
  to: Currency
  converted: string
  rate: string | null
  asOf: string | null
}

export interface RateAlert {
  id: string
  direction: AlertDirection
  threshold: string
  active: boolean
  lastTriggeredAt: string | null
  lastTriggeredRate: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateAlertPayload {
  direction: AlertDirection
  threshold: string
  active?: boolean
}

export interface UpdateAlertPayload {
  direction?: AlertDirection
  threshold?: string
  active?: boolean
}
