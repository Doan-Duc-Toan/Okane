import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { exchangeApi } from '../exchange.api'
import type { CreateAlertPayload, UpdateAlertPayload } from '../exchange.types'

export const alertsQueryKey = ['alerts'] as const

export function useAlerts() {
  return useQuery({ queryKey: alertsQueryKey, queryFn: exchangeApi.listAlerts })
}

export function useCreateAlert() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateAlertPayload) => exchangeApi.createAlert(payload),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: alertsQueryKey }),
  })
}

export function useUpdateAlert() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateAlertPayload }) =>
      exchangeApi.updateAlert(id, payload),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: alertsQueryKey }),
  })
}

export function useDeleteAlert() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => exchangeApi.deleteAlert(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: alertsQueryKey }),
  })
}
