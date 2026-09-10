import { useTranslation } from 'react-i18next'
import { Button } from './button'
import styles from './error-state.module.css'

interface ErrorStateProps {
  message?: string
  onRetry?: () => void
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  const { t } = useTranslation()
  return (
    <div className={styles.wrap} role="alert">
      <p className={styles.message}>{message ?? t('common.somethingWrong')}</p>
      {onRetry && (
        <Button variant="ghost" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      )}
    </div>
  )
}
