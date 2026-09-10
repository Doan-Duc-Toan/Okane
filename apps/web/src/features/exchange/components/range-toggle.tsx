import { useTranslation } from 'react-i18next'
import type { HistoryRange } from '../exchange.types'
import styles from './range-toggle.module.css'

interface RangeToggleProps {
  value: HistoryRange
  onChange: (range: HistoryRange) => void
}

export function RangeToggle({ value, onChange }: RangeToggleProps) {
  const { t } = useTranslation()
  const options: { value: HistoryRange; label: string }[] = [
    { value: '7d', label: t('exchange.chart7d') },
    { value: '30d', label: t('exchange.chart30d') },
    { value: '1y', label: t('exchange.chart1y') },
  ]

  return (
    <div className={styles.toggle} role="group" aria-label={t('exchange.rangeLabel')}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={styles.option}
          data-active={value === option.value}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
