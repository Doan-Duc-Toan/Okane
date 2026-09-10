import { useTranslation } from 'react-i18next'
import styles from './theme-toggle.module.css'

const LANGUAGES = ['vi', 'ja'] as const

export function LanguageToggle() {
  const { t, i18n } = useTranslation()

  return (
    <div className={styles.wrap} role="group" aria-label={t('language.label')}>
      {LANGUAGES.map((lng) => (
        <button
          key={lng}
          type="button"
          className={styles.option}
          data-active={i18n.language === lng}
          onClick={() => void i18n.changeLanguage(lng)}
          aria-pressed={i18n.language === lng}
        >
          {t(`language.${lng}`)}
        </button>
      ))}
    </div>
  )
}
