import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

/**
 * Rendered per the approved mockup, but disabled — Google OAuth is deferred
 * (backlog, plan.md): wiring it needs external credentials no build step can
 * supply autonomously. Deleting it would diverge from the approved layout;
 * a fake handler would be worse than an honest "coming soon". No onClick.
 */
export function GoogleButton() {
  const { t } = useTranslation()
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
