import { useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import type { Currency } from '../goals.types'
import styles from './goal-form.module.css'

export interface GoalFormValues {
  name: string
  targetAmount: string
  currency: Currency
  deadline: string
}

interface GoalFormProps {
  mode: 'create' | 'edit'
  initialValues?: Partial<GoalFormValues>
  submitting?: boolean
  onSubmit: (values: { name: string; targetAmount: string; deadline?: string; currency: Currency }) => void
  onCancel: () => void
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export function GoalForm({ mode, initialValues, submitting, onSubmit, onCancel }: GoalFormProps) {
  const { t } = useTranslation()
  const [name, setName] = useState(initialValues?.name ?? '')
  const [targetAmount, setTargetAmount] = useState(initialValues?.targetAmount ?? '')
  const [currency, setCurrency] = useState<Currency>(initialValues?.currency ?? 'JPY')
  const [deadline, setDeadline] = useState(initialValues?.deadline ?? '')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (submitting) return
    onSubmit({
      name,
      // Kept as the raw string the user typed — never coerced to Number
      // before it reaches the API (Phase 4's money-as-string rule).
      targetAmount,
      deadline: deadline || undefined,
      currency,
    })
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <Input
        label={t('newGoal.name')}
        placeholder={t('newGoal.namePlaceholder')}
        required
        maxLength={80}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Input
        label={t('newGoal.target')}
        type="number"
        min="0.01"
        step="0.01"
        required
        value={targetAmount}
        onChange={(e) => setTargetAmount(e.target.value)}
      />
      <Select
        label={t('newGoal.currency')}
        options={[
          { value: 'JPY', label: t('currency.JPY') },
          { value: 'VND', label: t('currency.VND') },
        ]}
        value={currency}
        disabled={mode === 'edit'}
        onChange={(e) => setCurrency(e.target.value as Currency)}
        hint={mode === 'edit' ? t('goal.currencyLocked') : undefined}
      />
      <Input
        label={t('newGoal.deadline')}
        type="date"
        min={today()}
        value={deadline}
        onChange={(e) => setDeadline(e.target.value)}
      />
      <p className={styles.hint}>{t('newGoal.hint')}</p>
      <div className={styles.actions}>
        <Button variant="ghost" type="button" onClick={onCancel} disabled={submitting}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={submitting}>
          {mode === 'create' ? t('newGoal.submit') : t('newGoal.saveChanges')}
        </Button>
      </div>
    </form>
  )
}
