import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { LedgerList } from '@/components/ui/ledger-list'
import { Spinner } from '@/components/ui/spinner'
import { CurrencyTotals } from './components/currency-totals'
import { GoalCard } from './components/goal-card'
import { RateTickerPlaceholder } from './components/rate-ticker-placeholder'
import { RecentActivity } from './components/recent-activity'
import { useDashboard } from './hooks/use-dashboard'
import styles from './dashboard-page.module.css'

export function DashboardPage() {
  const { t } = useTranslation()
  const { data, isLoading, isError, refetch } = useDashboard()

  return (
    <div className={styles.page}>
      <RateTickerPlaceholder />

      {isLoading && <Spinner />}
      {isError && <ErrorState onRetry={() => void refetch()} />}

      {data && (
        <>
          <CurrencyTotals totals={data.totals} />

          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>{t('dashboard.yourGoals')}</h2>
              <Link to="/goals/new">
                <Button>{t('dashboard.newGoal')}</Button>
              </Link>
            </div>
            {data.goals.length === 0 ? (
              <EmptyState
                title={t('dashboard.empty.title')}
                body={t('dashboard.empty.body')}
                action={
                  <Link to="/goals/new">
                    <Button>{t('dashboard.empty.cta')}</Button>
                  </Link>
                }
              />
            ) : (
              <LedgerList>
                {data.goals.map((goal) => (
                  <GoalCard key={goal.id} goal={goal} />
                ))}
              </LedgerList>
            )}
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t('dashboard.recentActivity')}</h2>
            <RecentActivity entries={data.recentEntries} />
          </section>
        </>
      )}
    </div>
  )
}
