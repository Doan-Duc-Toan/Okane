import { useTranslation } from 'react-i18next'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { Button } from './button'
import styles from './update-prompt.module.css'

export function UpdatePrompt() {
  const { t } = useTranslation()
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null

  return (
    <div className={styles.bar} role="status">
      <p className={styles.message}>{t('update.available')}</p>
      <div className={styles.actions}>
        <Button onClick={() => updateServiceWorker(true)}>{t('update.refresh')}</Button>
        <Button variant="ghost" onClick={() => setNeedRefresh(false)}>
          {t('update.dismiss')}
        </Button>
      </div>
    </div>
  )
}
