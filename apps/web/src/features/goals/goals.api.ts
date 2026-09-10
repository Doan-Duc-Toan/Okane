import { apiClient } from '@/lib/api-client'
import type {
  CreateEntryPayload,
  CreateGoalPayload,
  DashboardResponse,
  EntriesPage,
  Entry,
  EntryWithGoalName,
  Goal,
  UpdateEntryPayload,
  UpdateGoalPayload,
} from './goals.types'

/**
 * Typed against Phase 4's frozen endpoints. Phase 8 found the live backend
 * temporarily deviating from that contract (bare `Entry[]` instead of
 * `{ entries, nextCursor }`; nested `{ goal: { name } }` instead of flat
 * `goalName`) and added the two tolerant normalizations below. Phase 10
 * confirmed the backend now matches the frozen contract exactly — both
 * normalizations are left in place anyway since they're no-ops on the
 * correct shape and free forward/backward tolerance if a response ever
 * regresses, at effectively zero cost.
 * The Decimal-serialization bug these were originally paired with (money
 * fields arriving as raw decimal.js internals) was fixed on the backend
 * (`Decimal.isDecimal()` check) in Phase 10 — `format.ts`'s "—" +
 * console.error fallback stays too, as a last-line-of-defense guard rather
 * than an active workaround.
 */
function normalizeEntriesResponse(raw: unknown): EntriesPage {
  if (Array.isArray(raw)) return { entries: raw as Entry[], nextCursor: null }
  return raw as EntriesPage
}

function normalizeDashboardResponse(raw: DashboardResponse): DashboardResponse {
  return {
    ...raw,
    recentEntries: raw.recentEntries.map((entry) => {
      const withGoal = entry as EntryWithGoalName & { goal?: { name: string } }
      return { ...entry, goalName: withGoal.goalName ?? withGoal.goal?.name ?? '' }
    }),
  }
}

export const goalsApi = {
  getDashboard: async () => normalizeDashboardResponse(await apiClient.get<DashboardResponse>('/dashboard')),
  listGoals: () => apiClient.get<Goal[]>('/goals'),
  getGoal: (id: string) => apiClient.get<Goal>(`/goals/${id}`),
  createGoal: (payload: CreateGoalPayload) => apiClient.post<Goal>('/goals', payload),
  updateGoal: (id: string, payload: UpdateGoalPayload) =>
    apiClient.patch<Goal>(`/goals/${id}`, payload),
  deleteGoal: (id: string) => apiClient.delete<void>(`/goals/${id}`),

  listEntries: async (goalId: string, cursor?: string) =>
    normalizeEntriesResponse(
      await apiClient.get<unknown>(
        `/goals/${goalId}/entries?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
      ),
    ),
  createEntry: (goalId: string, payload: CreateEntryPayload) =>
    apiClient.post<Entry>(`/goals/${goalId}/entries`, payload),
  updateEntry: (id: string, payload: UpdateEntryPayload) =>
    apiClient.patch<Entry>(`/entries/${id}`, payload),
  deleteEntry: (id: string) => apiClient.delete<void>(`/entries/${id}`),
}
