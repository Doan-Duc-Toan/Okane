import { useMutation } from '@tanstack/react-query'
import { authApi } from '../auth.api'
import type { LoginPayload } from '../auth.api'

export function useLogin() {
  return useMutation({
    mutationFn: (payload: LoginPayload) => authApi.login(payload),
  })
}
