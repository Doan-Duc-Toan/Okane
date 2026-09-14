import type { AvailableBalanceResponse } from '../budget.types'

export type CardState = 'unconfigured' | 'rateUnavailable' | 'positive' | 'shortfall'

/**
 * Pure — no React — so the state machine that decides which of the four
 * required dashboard states to render can be unit-tested directly. Kept in
 * its own module (mirroring exchange-math.ts) rather than exported alongside
 * a component, which would break React Fast Refresh for this file.
 *
 * Priority order matters: `rateUnavailable` pre-empts the available/shortfall
 * read entirely, since `totalGoalNeed` (and everything derived from it) may
 * be wrong or partial without today's rate — that degraded view always wins
 * over trusting a possibly-incomplete available/shortfall number.
 */
export function resolveCardState(data: AvailableBalanceResponse): CardState {
  if (!data.configured) return 'unconfigured'
  if (data.rateUnavailable) return 'rateUnavailable'
  if (data.shortfall !== null && Number(data.shortfall) > 0) return 'shortfall'
  return 'positive'
}
