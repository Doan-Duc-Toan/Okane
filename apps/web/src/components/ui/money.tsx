import { useTranslation } from 'react-i18next'
import type { MoneyCurrency } from '@/lib/format'
import { formatMoney } from '@/lib/format'
import styles from './money.module.css'

interface MoneyProps {
  /** Always a string — money never round-trips through Number() in this app. */
  value: string
  currency: MoneyCurrency
  className?: string
}

export function Money({ value, currency, className }: MoneyProps) {
  const { i18n } = useTranslation()
  return (
    <span className={[styles.money, className].filter(Boolean).join(' ')}>
      {formatMoney(value, currency, i18n.language)}
    </span>
  )
}
