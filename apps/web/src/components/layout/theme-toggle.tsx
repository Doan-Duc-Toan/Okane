import { useTranslation } from 'react-i18next'
import { useTheme } from '@/contexts/theme-context'
import type { Theme } from '@/contexts/theme-context'
import styles from './theme-toggle.module.css'

const OPTIONS: Theme[] = ['light', 'dark', 'system']

export function ThemeToggle() {
  const { t } = useTranslation()
  const { theme, setTheme } = useTheme()

  return (
    <div className={styles.wrap} role="group" aria-label={t('theme.label')}>
      {OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          className={styles.option}
          data-active={theme === option}
          onClick={() => setTheme(option)}
          aria-pressed={theme === option}
        >
          {t(`theme.${option}`)}
        </button>
      ))}
    </div>
  )
}
