import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/card'
import { Money } from '@/components/ui/money'
import { ProgressBar } from '@/components/ui/progress-bar'
import type { Goal } from '../goals.types'
import styles from './goal-progress-hero.module.css'

export function GoalProgressHero({ goal }: { goal: Goal }) {
  const { t } = useTranslation()
  const { progress } = goal

  return (
    <Card className={styles.card}>
      <h1 className={styles.name}>{goal.name}</h1>
      <div className={styles.amounts}>
        <Money value={progress.savedAmount} currency={progress.currency} className={styles.saved} />
        <span className={styles.target}>
          {' / '}
          <Money value={progress.targetAmount} currency={progress.currency} />
        </span>
      </div>
      <ProgressBar
        percent={progress.progressPercent}
        size="hero"
        label={`${goal.name} ${progress.progressPercent}%`}
      />
      <p className={styles.percent}>{progress.progressPercent}%</p>
      {progress.deadlineStatus === 'completed' && (
        <p className={styles.completed}>{t('goal.goalCompleted')}</p>
      )}
    </Card>
  )
}
