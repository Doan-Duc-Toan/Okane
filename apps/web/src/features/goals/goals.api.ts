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
 * Typed against Phase 4's frozen endpoints. Two normalizations below exist
 * because the live backend's actual responses deviate from that frozen
 * contract (found via integration testing, not assumed) — see phase-08's
 * verification notes for the full report:
 *  - `GET /goals/:id/entries` returns a bare `Entry[]`, not the documented
 *    `{ entries, nextCursor }` envelope (so there is currently no cursor —
 *    pagination is effectively "load everything").
 *  - Dashboard `recentEntries` nest the goal as `{ goal: { name } }` rather
 *    than a flat `goalName` string.
 * Both are cheap, lossless adapters. What is NOT patched here: money fields
 * (`targetAmount`, `amount`, `amountInGoalCurrency`) come back as raw
 * decimal.js internals (`{ s, e, d }`) instead of strings — that one is a
 * backend serialization bug this layer cannot safely reconstruct, so
 * `format.ts` fails visibly ("—" + console.error) instead of guessing.
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
