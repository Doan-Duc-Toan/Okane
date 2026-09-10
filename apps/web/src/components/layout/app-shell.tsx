import { Outlet } from 'react-router'
import { TopNav } from './top-nav'
import styles from './app-shell.module.css'

export function AppShell() {
  return (
    <div className={styles.shell}>
      <TopNav />
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  )
}
