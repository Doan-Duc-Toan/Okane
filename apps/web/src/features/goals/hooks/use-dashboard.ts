import { useQuery } from '@tanstack/react-query'
import { goalsApi } from '../goals.api'

export const dashboardQueryKey = ['dashboard'] as const

export function useDashboard() {
  return useQuery({
    queryKey: dashboardQueryKey,
    queryFn: goalsApi.getDashboard,
  })
}
