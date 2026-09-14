import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { ApiError } from '@/lib/api-client'
import { loadGoogleIdentity } from '@/lib/google-identity'
import { useAuthSuccess } from '../hooks/use-auth-success'
import { useGoogleLogin } from '../hooks/use-google-login'

interface GoogleButtonProps {
  redirectTo: string
  onError: (message: string) => void
}

/**
 * Renders Google's own "Sign in with Google" button when VITE_GOOGLE_CLIENT_ID
 * is configured; otherwise falls back to the disabled "coming soon" button
 * (the original placeholder), unchanged — a fresh clone or local dev run with
 * no client id must render exactly what shipped before this feature existed.
 */
export function GoogleButton({ redirectTo, onError }: GoogleButtonProps) {
  const { t, i18n } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const googleLogin = useGoogleLogin()
  const authSuccess = useAuthSuccess()
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID

  useEffect(() => {
    if (!clientId) return

    // Re-runs on every mount (including React 19 StrictMode's dev-only double
    // invoke) and on every i18n.language change. Safe either way: initialize()
    // is idempotent, and the container is cleared before each renderButton
    // call, so a repeat run never produces two visible buttons.
    loadGoogleIdentity()
      .then((accountsId) => {
        accountsId.initialize({
          client_id: clientId,
          use_fedcm_for_button: true,
          callback: (response) => {
            if (!response.credential) {
              onError(t('login.error.google'))
              return
            }
            googleLogin.mutate(
              { credential: response.credential },
              {
                onSuccess: (session) => authSuccess(session, redirectTo),
                onError: (err) => {
                  onError(err instanceof ApiError ? err.message : t('login.error.network'))
                },
              },
            )
          },
        })
        if (containerRef.current) {
          containerRef.current.innerHTML = ''
          accountsId.renderButton(containerRef.current, {
            theme: 'outline',
            size: 'large',
            width: 320,
            locale: i18n.language,
            text: 'signin_with',
          })
        }
      })
      .catch(() => onError(t('login.error.google')))
    // Re-initializing on language change re-renders the button with the new
    // locale label; googleLogin/authSuccess/onError are stable across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, i18n.language])

  if (!clientId) {
    return (
      <Button
        variant="ghost"
        disabled
        aria-disabled="true"
        title={t('login.googleComingSoon')}
        style={{ width: '100%' }}
      >
        {t('login.google')}
      </Button>
    )
  }

  return (
    <div style={{ position: 'relative' }}>
      {/* Always mounted, even while pending — conditionally unmounting this
          would mean the init effect (keyed on clientId/language, not on
          pending state) never re-runs renderButton into it afterward. */}
      <div
        ref={containerRef}
        style={{
          display: 'flex',
          justifyContent: 'center',
          visibility: googleLogin.isPending ? 'hidden' : 'visible',
        }}
      />
      {/* Google's own rendered button (an iframe) can't show our spinner
          inside it, and closing the account picker already took a few
          seconds with no feedback of its own — so once we're verifying the
          credential, overlay an explicit "signing in" state instead of
          leaving the slot looking unresponsive for the length of our
          request. */}
      {googleLogin.isPending && (
        <div style={{ position: 'absolute', inset: 0 }}>
          <Spinner label={t('login.signingIn')} />
        </div>
      )}
    </div>
  )
}
