import { useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/contexts/auth-context'
import { ApiError } from '@/lib/api-client'
import { AuthCard } from './components/auth-card'
import { useRegister } from './hooks/use-register'

// Mirrors the server's rule (Phase 3): min 8 chars, at least one letter and one digit.
const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/

export function RegisterPage() {
  const { t } = useTranslation()
  const { login } = useAuth()
  const registerMutation = useRegister()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)

  function validate(): boolean {
    let valid = true
    setEmailError(null)
    setPasswordError(null)
    setConfirmError(null)

    if (!PASSWORD_RULE.test(password)) {
      setPasswordError(t('field.error.passwordTooWeak'))
      valid = false
    }
    if (password !== confirmPassword) {
      setConfirmError(t('field.error.passwordMismatch'))
      valid = false
    }
    return valid
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (registerMutation.isPending) return
    if (!validate()) return

    registerMutation.mutate(
      { email, password, displayName: displayName || undefined },
      {
        onSuccess: (session) => {
          queryClient.clear()
          login(session)
          navigate('/', { replace: true })
        },
        onError: (err) => {
          if (err instanceof ApiError) {
            if (err.status === 409) {
              setEmailError(t('register.error.emailTaken'))
            } else {
              setPasswordError(err.message)
            }
          } else {
            // A real fetch-level failure (server unreachable, DNS, etc.) — the
            // one case this message is actually true for.
            setPasswordError(t('login.error.network'))
          }
        },
      },
    )
  }

  return (
    <AuthCard active="register" title={t('register.h1')}>
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
          label={t('field.displayName')}
          type="text"
          name="displayName"
          autoComplete="name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <Input
          label={t('field.password')}
          type="password"
          name="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={passwordError ?? undefined}
          hint={passwordError ? undefined : t('field.error.passwordTooWeak')}
        />
        <Input
          label={t('field.confirmPassword')}
          type="password"
          name="confirmPassword"
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          error={confirmError ?? undefined}
        />
        <Button type="submit" disabled={registerMutation.isPending} style={{ width: '100%' }}>
          {t('register.submit')}
        </Button>
      </form>
      <p style={{ textAlign: 'center', fontSize: 'var(--text-sm)', margin: 0 }}>
        <Link to="/login">{t('login.backToLogin')}</Link>
      </p>
    </AuthCard>
  )
}
