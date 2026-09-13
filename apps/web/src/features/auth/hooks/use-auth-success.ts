import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { useAuth } from '@/contexts/auth-context'
import { useTheme } from '@/contexts/theme-context'
import type { AuthSession } from '@/lib/api-client'

/**
 * The shared post-session sequence every sign-in path (password login,
 * password register, Google on either page) must run identically: clear any
 * previous user's cached queries, adopt the session, adopt the server-stored
 * locale/theme, then navigate. Extracted so a fifth call site never has to
 * write these four steps by hand again.
 */
export function useAuthSuccess() {
  const { i18n } = useTranslation()
  const { login } = useAuth()
  const { theme, setTheme } = useTheme()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  return useCallback(
    (session: AuthSession, to: string) => {
      // A previous user's cached data must never leak into this session.
      queryClient.clear()
      login(session)
      // The server-stored locale/theme represents the user's cross-device
      // choice (set via PATCH /users/me elsewhere in the app) — adopt it on
      // sign-in when it differs from what this browser currently has.
      if (session.user.locale && session.user.locale !== i18n.language) {
        void i18n.changeLanguage(session.user.locale)
      }
      if (session.user.theme && session.user.theme !== theme) {
        setTheme(session.user.theme)
      }
      navigate(to, { replace: true })
    },
    [queryClient, login, i18n, theme, setTheme, navigate],
  )
}
