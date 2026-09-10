import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { Card } from '@/components/ui/card'
import { ApiError } from '@/lib/api-client'
import { useCreateGoal } from './hooks/use-goal-mutations'
import { GoalForm } from './components/goal-form'

export function NewGoalPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const createGoal = useCreateGoal()
  const [error, setError] = useState<string | null>(null)

  return (
    <Card style={{ maxWidth: '32rem', margin: '0 auto' }}>
      <h1 style={{ marginTop: 0, fontFamily: 'var(--font-heading)' }}>{t('newGoal.h1')}</h1>
      {error && (
        <p style={{ color: 'var(--color-alert)', fontSize: 'var(--text-sm)' }} role="alert">
          {error}
        </p>
      )}
      <GoalForm
        mode="create"
        submitting={createGoal.isPending}
        onCancel={() => navigate('/')}
        onSubmit={({ name, targetAmount, currency, deadline }) => {
          setError(null)
          createGoal.mutate(
            { name, targetAmount, currency, deadline },
            {
              onSuccess: (goal) => navigate(`/goals/${goal.id}`),
              onError: (err) =>
                setError(err instanceof ApiError ? err.message : t('common.somethingWrong')),
            },
          )
        }}
      />
    </Card>
  )
}
