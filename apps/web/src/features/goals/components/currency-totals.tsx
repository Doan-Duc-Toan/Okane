import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/card'
import { Money } from '@/components/ui/money'
import type { CurrencyTotal } from '../goals.types'
import styles from './currency-totals.module.css'

export function CurrencyTotals({ totals }: { totals: CurrencyTotal[] }) {
  const { t } = useTranslation()

  return (
    <div className={styles.row}>
      {totals.map((total) => (
        <Card key={total.currency} className={styles.card}>
          <span className={styles.label}>
            {total.currency === 'JPY' ? t('dashboard.savedJpy') : t('dashboard.savedVnd')}
          </span>
          <Money value={total.savedAmount} currency={total.currency} className={styles.amount} />
        </Card>
      ))}
    </div>
  )
}
