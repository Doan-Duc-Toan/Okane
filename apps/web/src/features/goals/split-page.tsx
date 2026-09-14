import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { Spinner } from '@/components/ui/spinner'
import type { SplitRouterState } from '@/features/budget/budget.types'
import { SplitForm } from './components/split-form'
import { useDashboard } from './hooks/use-dashboard'
import styles from './split-page.module.css'

/** Router state is caller-supplied and untyped at the navigation boundary —
 *  validated here so a malformed or absent state can never reach SplitForm
 *  as if it were trustworthy prefill data. */
function isSplitRouterState(value: unknown): value is SplitRouterState {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<SplitRouterState>
  return Array.isArray(candidate.allocations) && typeof candidate.currency === 'string'
}

export function SplitPage() {
  const { t } = useTranslation()
  const location = useLocation()
  const { data, isLoading, isError, refetch } = useDashboard()
  const prefill = isSplitRouterState(location.state) ? location.state : null

  return (
    <Card className={styles.card}>
      <Link to="/" className={styles.back}>
        {t('goal.back')}
      </Link>
      <h1 className={styles.title}>{t('split.pageTitle')}</h1>
      <p className={styles.hint}>{t('split.hint')}</p>

      {isLoading && <Spinner />}
      {isError && <ErrorState onRetry={() => void refetch()} />}

      {data && data.goals.length === 0 && (
        <EmptyState
          title={t('split.noGoalsTitle')}
          body={t('split.noGoalsBody')}
          action={
            <Link to="/goals/new">
              <Button>{t('dashboard.newGoal')}</Button>
            </Link>
          }
        />
      )}

      {data && data.goals.length > 0 && <SplitForm goals={data.goals} prefill={prefill} />}
    </Card>
  )
}
