import { useTranslation } from 'react-i18next'
import { LedgerList, LedgerRow } from '@/components/ui/ledger-list'
import { Money } from '@/components/ui/money'
import { formatDate, formatRate } from '@/lib/format'
import type { EntryWithGoalName } from '../goals.types'
import styles from './recent-activity.module.css'

export function RecentActivity({ entries }: { entries: EntryWithGoalName[] }) {
  const { t, i18n } = useTranslation()

  if (entries.length === 0) {
    return <p className={styles.empty}>{t('dashboard.noActivity')}</p>
  }

  return (
    <LedgerList>
      {entries.map((entry) => (
        <LedgerRow key={entry.id} className={styles.row}>
          <div>
            <p className={styles.goalName}>{entry.goalName}</p>
            <p className={styles.date}>{formatDate(entry.entryDate, i18n.language)}</p>
            {entry.note && <p className={styles.note}>{entry.note}</p>}
          </div>
          <div className={styles.amounts}>
            <Money value={entry.amount} currency={entry.currency} className={styles.amount} />
            {entry.fxRateUsed && (
              <p className={styles.converted}>
                → <Money value={entry.amountInGoalCurrency} currency={entry.currency === 'JPY' ? 'VND' : 'JPY'} />
                {' @ '}
                {formatRate(entry.fxRateUsed, i18n.language)}
              </p>
            )}
          </div>
        </LedgerRow>
      ))}
    </LedgerList>
  )
}
