import type { AuthSession } from '@/lib/api-client'
import { apiClient } from '@/lib/api-client'

/** Typed against Phase 3's frozen response contract (register/login/refresh share one shape). */

export interface RegisterPayload {
  email: string
  password: string
  displayName?: string
}

export interface LoginPayload {
  email: string
  password: string
}

export const authApi = {
  register: (payload: RegisterPayload) => apiClient.post<AuthSession>('/auth/register', payload),
  login: (payload: LoginPayload) => apiClient.post<AuthSession>('/auth/login', payload),
  logout: () => apiClient.post<void>('/auth/logout'),
}
