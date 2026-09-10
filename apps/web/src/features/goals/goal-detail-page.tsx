import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { Spinner } from '@/components/ui/spinner'
import { ApiError } from '@/lib/api-client'
import { DeleteConfirmDialog } from './components/delete-confirm-dialog'
import { EntryForm } from './components/entry-form'
import { EntryHistoryList } from './components/entry-history-list'
import { FxHelperPanel } from './components/fx-helper-panel'
import { GoalForm } from './components/goal-form'
import { GoalProgressHero } from './components/goal-progress-hero'
import { useDeleteGoal, useUpdateGoal } from './hooks/use-goal-mutations'
import { useEntries, useGoal } from './hooks/use-goal'
import styles from './goal-detail-page.module.css'

export function GoalDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [mutationError, setMutationError] = useState<string | null>(null)

  // useParams types :id as possibly undefined; the route can't actually match
  // without it, so this is a defensive fallback, not an expected path.
  const goalId = id ?? ''
  const goalQuery = useGoal(goalId)
  const entriesQuery = useEntries(goalId)
  const updateGoal = useUpdateGoal(goalId)
  const deleteGoal = useDeleteGoal()

  if (!id) return <Navigate to="/" replace />

  if (goalQuery.isLoading) return <Spinner />

  if (goalQuery.isError) {
    if (goalQuery.error instanceof ApiError && goalQuery.error.status === 404) {
      return (
        <EmptyState
          title={t('goal.notFoundTitle')}
          body={t('goal.notFoundBody')}
          action={
            <Link to="/">
              <Button>{t('goal.back')}</Button>
            </Link>
          }
        />
      )
    }
    return <ErrorState onRetry={() => void goalQuery.refetch()} />
  }

  const goal = goalQuery.data!
  const entryCount = entriesQuery.data?.pages.flatMap((p) => p.entries).length ?? 0

  return (
    <div className={styles.page}>
      <Link to="/" className={styles.back}>
        {t('goal.back')}
      </Link>

      {mutationError && (
        <p role="alert" className={styles.mutationError}>
          {mutationError}
        </p>
      )}

      {editing ? (
        <Card>
          <GoalForm
            mode="edit"
            initialValues={{
              name: goal.name,
              targetAmount: goal.targetAmount,
              currency: goal.currency,
              deadline: goal.deadline ?? '',
            }}
            submitting={updateGoal.isPending}
            onCancel={() => setEditing(false)}
            onSubmit={({ name, targetAmount, deadline }) => {
              setMutationError(null)
              updateGoal.mutate(
                { name, targetAmount, deadline: deadline ?? null },
                {
                  onSuccess: () => setEditing(false),
                  onError: () => setMutationError(t('common.somethingWrong')),
                },
              )
            }}
          />
        </Card>
      ) : (
        <GoalProgressHero goal={goal} />
      )}

      <FxHelperPanel progress={goal.progress} />

      <div className={styles.actionsRow}>
        <Button variant="ghost" onClick={() => setEditing((v) => !v)}>
          {t('goal.editGoal')}
        </Button>
        <Button variant="danger" onClick={() => setConfirmingDelete(true)}>
          {t('goal.deleteGoal')}
        </Button>
      </div>

      <Card>
        <h2 className={styles.sectionTitle}>{t('goal.logEntry')}</h2>
        <EntryForm goalId={id} goalCurrency={goal.currency} progress={goal.progress} />
      </Card>

      <section>
        <h2 className={styles.sectionTitle}>{t('goal.history')}</h2>
        <EntryHistoryList goalId={id} goalCurrency={goal.currency} />
      </section>

      {confirmingDelete && (
        <DeleteConfirmDialog
          message={t('goal.deleteGoalConfirm', { count: entryCount })}
          pending={deleteGoal.isPending}
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={() =>
            deleteGoal.mutate(id, {
              onSuccess: () => navigate('/'),
              onError: () => {
                setMutationError(t('common.somethingWrong'))
                setConfirmingDelete(false)
              },
            })
          }
        />
      )}
    </div>
  )
}
