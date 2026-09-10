import type { ReactNode } from 'react'
import styles from './empty-state.module.css'

interface EmptyStateProps {
  title: string
  body: string
  action?: ReactNode
}

export function EmptyState({ title, body, action }: EmptyStateProps) {
  return (
    <div className={styles.wrap}>
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.body}>{body}</p>
      {action}
    </div>
  )
}
