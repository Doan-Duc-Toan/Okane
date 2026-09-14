import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { Card } from '@/components/ui/card'
import { ErrorState } from '@/components/ui/error-state'
import { Spinner } from '@/components/ui/spinner'
import { ApiError } from '@/lib/api-client'
import { BudgetForm } from './components/budget-form'
import { useUpdateBudget } from './hooks/use-budget-mutations'
import { useBudget } from './hooks/use-budget'
import styles from './budget-settings-page.module.css'

export function BudgetSettingsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data, isLoading, isError, refetch } = useBudget()
  const updateBudget = useUpdateBudget()
  const [error, setError] = useState<string | null>(null)

  if (isLoading) return <Spinner />
  if (isError) return <ErrorState onRetry={() => void refetch()} />

  return (
    <Card className={styles.card}>
      <h1 className={styles.title}>{t('budget.pageTitle')}</h1>
      <p className={styles.hint}>{t('budget.pageHint')}</p>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <BudgetForm
        initialValues={data?.settings ?? undefined}
        submitting={updateBudget.isPending}
        onSubmit={(values) => {
          setError(null)
          updateBudget.mutate(values, {
            // The dashboard card is the payoff for this form — send the user
            // straight there so the number they just enabled is visible.
            onSuccess: () => navigate('/'),
            onError: (err) => setError(err instanceof ApiError ? err.message : t('common.somethingWrong')),
          })
        }}
      />
    </Card>
  )
}
