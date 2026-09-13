import { useMutation } from '@tanstack/react-query'
import { authApi } from '../auth.api'
import type { GoogleLoginPayload } from '../auth.api'

export function useGoogleLogin() {
  return useMutation({
    mutationFn: (payload: GoogleLoginPayload) => authApi.googleLogin(payload),
  })
}
