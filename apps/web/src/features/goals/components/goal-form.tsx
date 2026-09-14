import { useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { AmountInput } from '@/components/ui/amount-input'
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
  const [nameError, setNameError] = useState<string | null>(null)
  const [amountError, setAmountError] = useState<string | null>(null)

  function validate(): boolean {
    let valid = true
    setNameError(null)
    setAmountError(null)

    const trimmedName = name.trim()
    if (!trimmedName) {
      setNameError(t('field.error.required'))
      valid = false
    } else if (trimmedName.length > 80) {
      setNameError(t('newGoal.error.nameTooLong'))
      valid = false
    }

    const amount = Number(targetAmount)
    if (!targetAmount.trim()) {
      setAmountError(t('field.error.required'))
      valid = false
    } else if (!Number.isFinite(amount) || amount <= 0) {
      setAmountError(t('newGoal.error.amountInvalid'))
      valid = false
    }

    return valid
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (submitting) return
    if (!validate()) return
    onSubmit({
      name: name.trim(),
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
        error={nameError ?? undefined}
      />
      <AmountInput
        label={t('newGoal.target')}
        required
        value={targetAmount}
        onChange={setTargetAmount}
        error={amountError ?? undefined}
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
        <Button type="submit" isLoading={submitting}>
          {mode === 'create' ? t('newGoal.submit') : t('newGoal.saveChanges')}
        </Button>
      </div>
    </form>
  )
}
