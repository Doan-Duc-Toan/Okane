import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { LedgerRow } from '@/components/ui/ledger-list'
import { Money } from '@/components/ui/money'
import { ProgressBar } from '@/components/ui/progress-bar'
import { formatDate } from '@/lib/format'
import type { Goal } from '../goals.types'
import styles from './goal-card.module.css'

/** One row in the dashboard's goal ledger (mockup pattern — not a card grid). */
export function GoalCard({ goal }: { goal: Goal }) {
  const { t, i18n } = useTranslation()
  const { progress } = goal

  return (
    <LedgerRow className={styles.row}>
      <Link to={`/goals/${goal.id}`} className={styles.link}>
        <div className={styles.head}>
          <h3 className={styles.name}>{goal.name}</h3>
          {goal.deadline && (
            <span className={styles.chip} data-overdue={progress.deadlineStatus === 'overdue'}>
              {progress.deadlineStatus === 'overdue'
                ? t('goal.deadlineOverdue')
                : formatDate(goal.deadline, i18n.language)}
            </span>
          )}
        </div>
        <div className={styles.amounts}>
          <Money value={progress.savedAmount} currency={progress.currency} className={styles.saved} />
          <span className={styles.target}>
            {' / '}
            <Money value={progress.targetAmount} currency={progress.currency} />
          </span>
        </div>
        <ProgressBar
          percent={progress.progressPercent}
          label={`${goal.name} ${progress.progressPercent}%`}
        />
      </Link>
    </LedgerRow>
  )
}
