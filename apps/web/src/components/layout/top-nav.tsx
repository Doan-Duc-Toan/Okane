import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router'
import { useAuth } from '@/contexts/auth-context'
import { LanguageToggle } from './language-toggle'
import { ThemeToggle } from './theme-toggle'
import styles from './top-nav.module.css'

export function TopNav() {
  const { t } = useTranslation()
  const { logout } = useAuth()

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    [styles.link, isActive && styles.linkActive].filter(Boolean).join(' ')

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <span className={styles.brand}>Okane</span>
        <nav className={styles.nav}>
          <NavLink to="/" end className={linkClass}>
            {t('nav.dashboard')}
          </NavLink>
          <NavLink to="/exchange" className={linkClass}>
            {t('nav.exchange')}
          </NavLink>
        </nav>
        <div className={styles.controls}>
          <ThemeToggle />
          <LanguageToggle />
          <button type="button" className={styles.signOut} onClick={() => void logout()}>
            {t('nav.logout')}
          </button>
        </div>
      </div>
    </header>
  )
}
