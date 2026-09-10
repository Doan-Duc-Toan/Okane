import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { NavLink, useNavigate } from 'react-router'
import { useAuth } from '@/contexts/auth-context'
import { LanguageToggle } from './language-toggle'
import { ThemeToggle } from './theme-toggle'
import styles from './top-nav.module.css'

export function TopNav() {
  const { t } = useTranslation()
  const { logout } = useAuth()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    [styles.link, isActive && styles.linkActive].filter(Boolean).join(' ')

  async function handleSignOut() {
    // Server revoke + local clear happen inside logout(); the query cache
    // must be cleared too, or the next user on this browser briefly sees
    // this user's cached goals (dashboard, entries, etc.).
    await logout()
    queryClient.clear()
    navigate('/login', { replace: true })
  }

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
          <button type="button" className={styles.signOut} onClick={() => void handleSignOut()}>
            {t('nav.logout')}
          </button>
        </div>
      </div>
    </header>
  )
}
