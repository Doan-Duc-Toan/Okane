import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Card } from '@/components/ui/card'
import { LanguageToggle } from '@/components/layout/language-toggle'
import { ThemeToggle } from '@/components/layout/theme-toggle'
import styles from './auth-card.module.css'

interface AuthCardProps {
  active: 'login' | 'register'
  title: string
  children: ReactNode
  footer?: ReactNode
}

/** Shared shell for Login and Register so the two screens cannot drift apart visually. */
export function AuthCard({ active, title, children, footer }: AuthCardProps) {
  const { t } = useTranslation()

  return (
    <div className={styles.wrap}>
      <div className={styles.preferences}>
        <ThemeToggle />
        <LanguageToggle />
      </div>
      <Card className={styles.card}>
        <span className={styles.brand}>Okane</span>
        <div className={styles.tabs} role="tablist">
          <Link
            to="/login"
            role="tab"
            aria-selected={active === 'login'}
            className={styles.tab}
            data-active={active === 'login'}
          >
            {t('login.tabLogin')}
          </Link>
          <Link
            to="/register"
            role="tab"
            aria-selected={active === 'register'}
            className={styles.tab}
            data-active={active === 'register'}
          >
            {t('login.tabRegister')}
          </Link>
        </div>
        <h2 className={styles.title}>{title}</h2>
        {children}
        {footer && <div className={styles.footer}>{footer}</div>}
      </Card>
    </div>
  )
}
