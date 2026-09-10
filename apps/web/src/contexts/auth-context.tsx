import { createContext, use, useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { AuthSession } from '@/lib/api-client'
import {
  apiClient,
  attemptRefresh,
  setOnSessionExpired,
  setRefreshTokenOnly,
  setTokens,
} from '@/lib/api-client'

export type AuthUser = AuthSession['user']

type AuthStatus = 'restoring' | 'authenticated' | 'guest'

interface AuthContextValue {
  status: AuthStatus
  user: AuthUser | null
  /** True when the last session ended via an expired/invalid token, not a manual logout. */
  sessionExpired: boolean
  login: (session: AuthSession) => void
  logout: () => Promise<void>
  clearSessionExpired: () => void
}

const REFRESH_STORAGE_KEY = 'okane.refresh'

const AuthContext = createContext<AuthContextValue | null>(null)

function readStoredRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_STORAGE_KEY)
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('restoring')
  const [user, setUser] = useState<AuthUser | null>(null)
  const [sessionExpired, setSessionExpired] = useState(false)

  const login = useCallback((session: AuthSession) => {
    setTokens(session)
    try {
      localStorage.setItem(REFRESH_STORAGE_KEY, session.refreshToken)
    } catch {
      // localStorage unavailable — session still works for this tab
    }
    setUser(session.user)
    setSessionExpired(false)
    setStatus('authenticated')
  }, [])

  const clearLocalSession = useCallback(() => {
    setTokens(null)
    try {
      localStorage.removeItem(REFRESH_STORAGE_KEY)
    } catch {
      // ignore
    }
    setUser(null)
    setStatus('guest')
  }, [])

  const logout = useCallback(async () => {
    try {
      await apiClient.post('/auth/logout')
    } catch {
      // best-effort: even if the server call fails, clear the local session
      // so the user is never stuck "signed in" on their own device
    } finally {
      clearLocalSession()
    }
  }, [clearLocalSession])

  // Silent restore on boot: if a refresh token exists, attempt one refresh
  // before rendering the router, so a reload doesn't flash the login page.
  useEffect(() => {
    setOnSessionExpired(() => {
      clearLocalSession()
      setSessionExpired(true)
    })

    const storedRefresh = readStoredRefreshToken()
    if (!storedRefresh) {
      setStatus('guest')
      return
    }

    setRefreshTokenOnly(storedRefresh)
    attemptRefresh()
      .then((session) => {
        if (session) login(session)
        else clearLocalSession()
      })
      .catch(() => clearLocalSession())
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on boot
  }, [])

  const value = useMemo(
    () => ({
      status,
      user,
      sessionExpired,
      login,
      logout,
      clearSessionExpired: () => setSessionExpired(false),
    }),
    [status, user, sessionExpired, login, logout],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}

export function useAuth(): AuthContextValue {
  const ctx = use(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
