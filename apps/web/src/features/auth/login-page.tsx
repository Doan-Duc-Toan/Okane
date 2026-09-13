import { useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ApiError } from '@/lib/api-client'
import { AuthCard } from './components/auth-card'
import { GoogleButton } from './components/google-button'
import { useAuthSuccess } from './hooks/use-auth-success'
import { useLogin } from './hooks/use-login'
import styles from './login-page.module.css'

interface LocationState {
  from?: { pathname: string }
}

const EMAIL_RULE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function LoginPage() {
  const { t } = useTranslation()
  const loginMutation = useLogin()
  const authSuccess = useAuthSuccess()
  const location = useLocation()
  const [searchParams] = useSearchParams()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const sessionExpiredNotice = searchParams.get('reason') === 'expired'
  const redirectTo = (location.state as LocationState | null)?.from?.pathname ?? '/'

  function validate(): boolean {
    let valid = true
    setEmailError(null)
    setPasswordError(null)

    if (!email.trim()) {
      setEmailError(t('field.error.required'))
      valid = false
    } else if (!EMAIL_RULE.test(email)) {
      setEmailError(t('field.error.emailInvalid'))
      valid = false
    }
    if (!password) {
      setPasswordError(t('field.error.required'))
      valid = false
    }
    return valid
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (loginMutation.isPending) return
    setFormError(null)
    if (!validate()) return

    loginMutation.mutate(
      { email, password },
      {
        onSuccess: (session) => authSuccess(session, redirectTo),
        onError: (err) => {
          if (err instanceof ApiError) {
            setFormError(err.status === 401 ? t('login.error.invalidCredentials') : err.message)
          } else {
            // A real fetch-level failure (server unreachable, DNS, etc.) — the
            // one case this message is actually true for.
            setFormError(t('login.error.network'))
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
        {formError && (
          <p className={styles.formError} role="alert">
            {formError}
          </p>
        )}
        <form onSubmit={handleSubmit} noValidate>
          <Input
            label={t('field.email')}
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={emailError ?? undefined}
          />
          <Input
            label={t('field.password')}
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={passwordError ?? undefined}
          />
          <Button type="submit" disabled={loginMutation.isPending} style={{ width: '100%' }}>
            {t('login.submit')}
          </Button>
        </form>
        <div className={styles.divider}>
          <span>{t('login.or')}</span>
        </div>
        <GoogleButton redirectTo={redirectTo} onError={setFormError} />
        <p className={styles.footerLink}>
          <Link to="/register">{t('login.createAccount')}</Link>
        </p>
      </AuthCard>
    </div>
  )
}
