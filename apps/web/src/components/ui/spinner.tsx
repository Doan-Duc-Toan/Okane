import { useTranslation } from 'react-i18next'
import styles from './spinner.module.css'

export function Spinner({ label }: { label?: string }) {
  const { t } = useTranslation()
  return (
    <div className={styles.wrap} role="status" aria-live="polite">
      <span className={styles.spinner} aria-hidden="true" />
      <span className={styles.label}>{label ?? t('common.loading')}</span>
    </div>
  )
}
