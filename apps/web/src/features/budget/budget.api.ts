import { apiClient, request } from '@/lib/api-client'
import type { AvailableBalanceResponse, BudgetResponse, UpdateBudgetPayload } from './budget.types'

export const budgetApi = {
  getBudget: () => apiClient.get<BudgetResponse>('/budget'),
  // apiClient has no `put` helper (only get/post/patch/delete) — this is the
  // one PUT call in the app, so it goes straight through the lower-level
  // `request` the other verbs are themselves built on, rather than growing
  // api-client.ts (out of this phase's file scope) for a single call site.
  updateBudget: (payload: UpdateBudgetPayload) =>
    request<BudgetResponse>('/budget', { method: 'PUT', body: JSON.stringify(payload) }),
  getAvailableBalance: () => apiClient.get<AvailableBalanceResponse>('/budget/available'),
}
