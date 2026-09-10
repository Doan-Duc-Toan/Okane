import { Outlet } from 'react-router'
import { RateTicker } from '@/features/exchange/components/rate-ticker'
import { TopNav } from './top-nav'
import styles from './app-shell.module.css'

// The rate ticker is mounted once here (not per-page) so it is persistent
// across every authenticated screen, per the mockup's "top ticker band"
// convention — not just the dashboard or the exchange page.
export function AppShell() {
  return (
    <div className={styles.shell}>
      <RateTicker />
      <TopNav />
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  )
}
