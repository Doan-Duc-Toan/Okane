import { useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { ApiError } from '@/lib/api-client'
import { formatRate } from '@/lib/format'
import { useCreateAlert } from '../hooks/use-alert-mutations'
import type { AlertDirection } from '../exchange.types'
import styles from './alert-form.module.css'

interface AlertFormProps {
  currentRate: string | null
  onCancel: () => void
  onCreated: () => void
}

export function AlertForm({ currentRate, onCancel, onCreated }: AlertFormProps) {
  const { t, i18n } = useTranslation()
  const createAlert = useCreateAlert()
  const [direction, setDirection] = useState<AlertDirection>('ABOVE')
  const [threshold, setThreshold] = useState('')
  const [thresholdError, setThresholdError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const thresholdNumber = Number(threshold)
  const preview =
    threshold !== '' && !Number.isNaN(thresholdNumber)
      ? t(direction === 'ABOVE' ? 'exchange.previewAbove' : 'exchange.previewBelow', {
          threshold: formatRate(threshold, i18n.language),
          current: currentRate ? formatRate(currentRate, i18n.language) : '—',
        })
      : null

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (createAlert.isPending) return
    setError(null)
    setThresholdError(null)
    if (!threshold.trim() || !Number.isFinite(thresholdNumber) || thresholdNumber <= 0) {
      setThresholdError(t('newGoal.error.amountInvalid'))
      return
    }
    createAlert.mutate(
      { direction, threshold },
      {
        onSuccess: onCreated,
        // Surfaces the server's own message (e.g. the per-user cap) rather
        // than a generic failure — the cap is also checked before this form
        // is even shown, but a second tab could still race past that check.
        onError: (err) => setError(err instanceof ApiError ? err.message : t('common.somethingWrong')),
      },
    )
  }

  return (
    <form onSubmit={handleSubmit} noValidate className={styles.form}>
      <div className={styles.row}>
        <Select
          label={t('exchange.direction')}
          options={[
            { value: 'ABOVE', label: t('exchange.above') },
            { value: 'BELOW', label: t('exchange.below') },
          ]}
          value={direction}
          onChange={(e) => setDirection(e.target.value as AlertDirection)}
        />
        <Input
          label={t('exchange.threshold')}
          type="number"
          min="0.00000001"
          step="0.01"
          placeholder="168.50"
          required
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
          error={thresholdError ?? undefined}
        />
      </div>
      {preview && <p className={styles.preview}>{preview}</p>}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <div className={styles.actions}>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={createAlert.isPending}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" isLoading={createAlert.isPending} disabled={threshold === ''}>
          {t('common.save')}
        </Button>
      </div>
    </form>
  )
}
