import { useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { AmountInput } from '@/components/ui/amount-input'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { ApiError } from '@/lib/api-client'
import { formatMoney } from '@/lib/format'
import type { Currency, SplitRouterState } from '@/features/budget/budget.types'
import type { Goal } from '../goals.types'
import { useSplitMutation } from '../hooks/use-split-mutation'
import { computeSplitSummary } from './split-summary'
import styles from './split-form.module.css'

interface SplitFormProps {
  goals: Goal[]
  prefill: SplitRouterState | null
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Prefill amounts for goals no longer in `goals` (e.g. deleted since the
 * suggestion was generated) are silently dropped rather than crashing.
 * A suggested "0.00" (a goal the allocation couldn't cover at all this
 * round) is dropped too — prefilling a literal zero would land on a row
 * that reads as "filled" but is not a positive amount, which blocks submit
 * for a reason invisible to the user. Leaving the row blank means "not
 * included", which is what a zero suggestion actually means.
 */
function initialAmounts(goals: Goal[], prefill: SplitRouterState | null): Record<string, string> {
  const byGoalId = new Map(
    (prefill?.allocations ?? []).filter((a) => Number(a.amount) > 0).map((a) => [a.goalId, a.amount]),
  )
  return Object.fromEntries(goals.map((goal) => [goal.id, byGoalId.get(goal.id) ?? '']))
}

export function SplitForm({ goals, prefill }: SplitFormProps) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const splitMutation = useSplitMutation()

  const [amounts, setAmounts] = useState<Record<string, string>>(() => initialAmounts(goals, prefill))
  const [currency, setCurrency] = useState<Currency>(prefill?.currency ?? 'JPY')
  const [total, setTotal] = useState(() =>
    prefill ? String(prefill.allocations.reduce((acc, a) => acc + (Number(a.amount) || 0), 0)) : '',
  )
  const [entryDate, setEntryDate] = useState(today())
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const summary = computeSplitSummary(amounts, total)
  const dateInFuture = entryDate > today()

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (splitMutation.isPending || dateInFuture || !summary.canSubmit) return
    setError(null)

    const allocations = Object.entries(amounts)
      .filter(([, value]) => value.trim() !== '')
      .map(([goalId, amount]) => ({ goalId, amount, currency }))

    splitMutation.mutate(
      { entryDate, note: note || undefined, allocations },
      {
        // Back to the dashboard so the goal cards and available number the
        // user just changed are the very next thing they see.
        onSuccess: () => navigate('/'),
        onError: (err) => setError(err instanceof ApiError ? err.message : t('common.somethingWrong')),
      },
    )
  }

  return (
    <form onSubmit={handleSubmit} noValidate className={styles.form}>
      <div className={styles.row}>
        <AmountInput label={t('split.total')} value={total} onChange={setTotal} />
        <Select
          label={t('newGoal.currency')}
          options={[
            { value: 'JPY', label: t('currency.JPY') },
            { value: 'VND', label: t('currency.VND') },
          ]}
          value={currency}
          onChange={(e) => setCurrency(e.target.value as Currency)}
        />
      </div>

      {summary.leftToAllocate !== null && (
        <p className={summary.overAllocated ? styles.overAllocated : styles.leftToAllocate}>
          {t('split.leftToAllocate')}: {formatMoney(String(summary.leftToAllocate), currency, i18n.language)}
        </p>
      )}

      <div className={styles.goalRows}>
        {goals.map((goal) => (
          <AmountInput
            key={goal.id}
            label={t('split.rowAmountLabel', { name: goal.name })}
            value={amounts[goal.id]}
            onChange={(value) => setAmounts((prev) => ({ ...prev, [goal.id]: value }))}
          />
        ))}
      </div>

      <Input
        label={t('field.date')}
        type="date"
        required
        max={today()}
        value={entryDate}
        onChange={(e) => setEntryDate(e.target.value)}
        error={dateInFuture ? t('goal.entryDateFuture') : undefined}
      />
      <Input label={t('field.note')} type="text" value={note} onChange={(e) => setNote(e.target.value)} />

      {summary.filledCount === 0 && <p className={styles.hint}>{t('split.hintNoRows')}</p>}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <div className={styles.actions}>
        <Button variant="ghost" type="button" onClick={() => navigate('/')} disabled={splitMutation.isPending}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={splitMutation.isPending || dateInFuture || !summary.canSubmit}>
          {t('split.submit')}
        </Button>
      </div>
    </form>
  )
}
