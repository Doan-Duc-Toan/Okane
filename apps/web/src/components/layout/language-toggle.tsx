import { useTranslation } from 'react-i18next'
import styles from './language-toggle.module.css'

// Short codes on the button face (per the approved mockup's "VI / JA" pill
// design) — the full name ("Tiếng Việt" / "日本語") only goes in
// aria-label/title. The full name as visible text doesn't fit any
// reasonably-sized button, and "日本語" in particular wraps character-by-
// character in a narrow box rather than breaking as a whole word.
const LANGUAGES = [
  { code: 'vi', short: 'VI' },
  { code: 'ja', short: 'JA' },
] as const

export function LanguageToggle() {
  const { t, i18n } = useTranslation()

  return (
    <div className={styles.wrap} role="group" aria-label={t('language.label')}>
      {LANGUAGES.map(({ code, short }) => (
        <button
          key={code}
          type="button"
          className={styles.option}
          data-active={i18n.language === code}
          onClick={() => void i18n.changeLanguage(code)}
          aria-pressed={i18n.language === code}
          aria-label={t(`language.${code}`)}
          title={t(`language.${code}`)}
        >
          {short}
        </button>
      ))}
    </div>
  )
}
