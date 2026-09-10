import { useMutation } from '@tanstack/react-query'
import { authApi } from '../auth.api'
import type { RegisterPayload } from '../auth.api'

export function useRegister() {
  return useMutation({
    mutationFn: (payload: RegisterPayload) => authApi.register(payload),
  })
}
