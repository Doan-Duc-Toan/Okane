import type { HTMLAttributes, LiHTMLAttributes } from 'react'
import styles from './ledger-list.module.css'

/**
 * The mockup's "ledger" pattern: a bordered container with hairline-divided
 * rows (no border on the last row) — used for goal lists, activity, and
 * entry history, in place of one-card-per-item grids.
 */
export function LedgerList({ className, ...rest }: HTMLAttributes<HTMLUListElement>) {
  return <ul className={[styles.list, className].filter(Boolean).join(' ')} {...rest} />
}

export function LedgerRow({ className, ...rest }: LiHTMLAttributes<HTMLLIElement>) {
  return <li className={[styles.row, className].filter(Boolean).join(' ')} {...rest} />
}
