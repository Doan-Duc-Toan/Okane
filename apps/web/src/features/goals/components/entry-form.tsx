import { useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { ApiError } from '@/lib/api-client'
import { formatMoney } from '@/lib/format'
import { useCreateEntry } from '../hooks/use-entry-mutations'
import type { Currency, ProgressBlock } from '../goals.types'
import styles from './entry-form.module.css'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Preview-only conversion (server freezes the authoritative value on submit). */
function convertPreview(amount: number, from: Currency, to: Currency, jpyToVndRate: number): number {
  if (from === to) return amount
  return from === 'JPY' ? amount * jpyToVndRate : amount / jpyToVndRate
}

interface EntryFormProps {
  goalId: string
  goalCurrency: Currency
  progress: ProgressBlock
}

export function EntryForm({ goalId, goalCurrency, progress }: EntryFormProps) {
  const { t, i18n } = useTranslation()
  const createEntry = useCreateEntry(goalId)
  const amountInputId = 'entry-amount-input'

  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState<Currency>(goalCurrency)
  const [entryDate, setEntryDate] = useState(today())
  const [note, setNote] = useState('')
  const [amountError, setAmountError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const rate = progress.rateUsed ? Number(progress.rateUsed) : null
  const crossCurrency = currency !== goalCurrency
  const amountNumber = Number(amount)
  const showPreview = crossCurrency && amount && !Number.isNaN(amountNumber) && rate !== null
  const dateInFuture = entryDate > today()

  function validate(): boolean {
    setAmountError(null)
    if (!amount.trim()) {
      setAmountError(t('field.error.required'))
      return false
    }
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      setAmountError(t('newGoal.error.amountInvalid'))
      return false
    }
    return true
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (createEntry.isPending || dateInFuture) return
    setError(null)
    if (!validate()) return

    createEntry.mutate(
      { amount, currency, entryDate, note: note || undefined },
      {
        onSuccess: () => {
          setAmount('')
          setNote('')
          document.getElementById(amountInputId)?.focus()
        },
        onError: (err) => {
          if (err instanceof ApiError && err.status === 503) {
            setError(t('goal.entryNoRate', { currency: goalCurrency }))
          } else if (err instanceof ApiError) {
            setError(err.message)
          } else {
            setError(t('common.somethingWrong'))
          }
        },
      },
    )
  }

  return (
    <form onSubmit={handleSubmit} noValidate className={styles.form}>
      <div className={styles.row}>
        <Input
          id={amountInputId}
          label={t('field.amount')}
          type="number"
          min="0.01"
          step="0.01"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          error={amountError ?? undefined}
        />
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
      {showPreview && rate !== null && (
        <p className={styles.preview}>
          {t('goal.entryConvertedPreview', {
            amount: formatMoney(
              String(Math.round(convertPreview(amountNumber, currency, goalCurrency, rate))),
              goalCurrency,
              i18n.language,
            ),
            rate: rate.toFixed(2),
          })}
        </p>
      )}
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
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <Button type="submit" disabled={createEntry.isPending || dateInFuture}>
        {t('goal.addEntry')}
      </Button>
    </form>
  )
}
