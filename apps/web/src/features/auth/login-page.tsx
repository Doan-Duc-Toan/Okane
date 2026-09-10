import { useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/contexts/auth-context'
import { useTheme } from '@/contexts/theme-context'
import { ApiError } from '@/lib/api-client'
import type { AuthSession } from '@/lib/api-client'
import { AuthCard } from './components/auth-card'
import { GoogleButton } from './components/google-button'
import { useLogin } from './hooks/use-login'
import styles from './login-page.module.css'

interface LocationState {
  from?: { pathname: string }
}

export function LoginPage() {
  const { t, i18n } = useTranslation()
  const { login } = useAuth()
  const { theme, setTheme } = useTheme()
  const loginMutation = useLogin()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  const sessionExpiredNotice = searchParams.get('reason') === 'expired'

  // The server-stored locale/theme represents the user's cross-device choice
  // (set via PATCH /users/me elsewhere in the app) — adopt it on sign-in when
  // it differs from what this browser currently has, per Phase 6/7.
  function adoptServerPreferences(session: AuthSession) {
    if (session.user.locale && session.user.locale !== i18n.language) {
      void i18n.changeLanguage(session.user.locale)
    }
    if (session.user.theme && session.user.theme !== theme) {
      setTheme(session.user.theme)
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (loginMutation.isPending) return
    setError(null)

    loginMutation.mutate(
      { email, password },
      {
        onSuccess: (session) => {
          // A previous user's cached data must never leak into this session.
          queryClient.clear()
          login(session)
          adoptServerPreferences(session)
          const state = location.state as LocationState | null
          navigate(state?.from?.pathname ?? '/', { replace: true })
        },
        onError: (err) => {
          if (err instanceof ApiError && err.status === 401) {
            setError(t('login.error.invalidCredentials'))
          } else {
            setError(t('login.error.network'))
          }
        },
      },
    )
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <h1 className={styles.h1}>{t('login.h1')}</h1>
        <p className={styles.p}>{t('login.p')}</p>
      </section>
      <AuthCard active="login" title={t('login.welcome')}>
        {sessionExpiredNotice && <p className={styles.notice}>{t('common.sessionExpired')}</p>}
        <form onSubmit={handleSubmit} noValidate>
          <Input
            label={t('field.email')}
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            label={t('field.password')}
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={error ?? undefined}
          />
          <Button type="submit" disabled={loginMutation.isPending} style={{ width: '100%' }}>
            {t('login.submit')}
          </Button>
        </form>
        <div className={styles.divider}>
          <span>{t('login.or')}</span>
        </div>
        <GoogleButton />
        <p className={styles.footerLink}>
          <Link to="/register">{t('login.createAccount')}</Link>
        </p>
      </AuthCard>
    </div>
  )
}
