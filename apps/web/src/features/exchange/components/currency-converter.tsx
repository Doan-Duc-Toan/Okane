import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { formatMoney } from '@/lib/format'
import { convertJpyToVnd, convertVndToJpy } from '../exchange-math'
import styles from './currency-converter.module.css'

/** Bidirectional, purely local — no network call per keystroke (see exchange-math.ts). */
export function CurrencyConverter({ rate }: { rate: string | null }) {
  const { t, i18n } = useTranslation()
  const [jpy, setJpy] = useState('')
  const [vnd, setVnd] = useState('')

  const numericRate = rate !== null ? Number(rate) : null
  const disabled = numericRate === null

  function handleJpyChange(value: string) {
    setJpy(value)
    const amount = Number(value)
    if (numericRate === null || value === '' || Number.isNaN(amount)) {
      setVnd('')
      return
    }
    setVnd(String(Math.round(convertJpyToVnd(amount, numericRate))))
  }

  function handleVndChange(value: string) {
    setVnd(value)
    const amount = Number(value)
    if (numericRate === null || value === '' || Number.isNaN(amount)) {
      setJpy('')
      return
    }
    setJpy(String(Math.round(convertVndToJpy(amount, numericRate))))
  }

  return (
    <Card className={styles.card}>
      <h3 className={styles.title}>{t('exchange.quickConvert')}</h3>
      {disabled && <p className={styles.noRate}>{t('exchange.noRateForConvert')}</p>}
      <div className={styles.row}>
        <Input
          label={t('currency.JPY')}
          type="number"
          min="0"
          placeholder="0"
          disabled={disabled}
          value={jpy}
          onChange={(e) => handleJpyChange(e.target.value)}
        />
        <span className={styles.swap} aria-hidden="true">
          ⇄
        </span>
        <Input
          label={t('currency.VND')}
          type="number"
          min="0"
          placeholder="0"
          disabled={disabled}
          value={vnd}
          onChange={(e) => handleVndChange(e.target.value)}
        />
      </div>
      {!disabled && jpy !== '' && vnd !== '' && (
        <p className={styles.formatted}>
          {formatMoney(jpy, 'JPY', i18n.language)} ≈ {formatMoney(vnd, 'VND', i18n.language)}
        </p>
      )}
    </Card>
  )
}
