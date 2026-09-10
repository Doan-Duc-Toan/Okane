import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { Spinner } from '@/components/ui/spinner'
import { AlertList } from './components/alert-list'
import { CurrencyConverter } from './components/currency-converter'
import { RangeToggle } from './components/range-toggle'
import { RateChart } from './components/rate-chart'
import { RateHero } from './components/rate-hero'
import { SmilesLink } from './components/smiles-link'
import { useCurrentRate } from './hooks/use-current-rate'
import { useRateHistory } from './hooks/use-rate-history'
import type { HistoryRange } from './exchange.types'
import styles from './exchange-page.module.css'

export function ExchangePage() {
  const { t } = useTranslation()
  const [range, setRange] = useState<HistoryRange>('7d')

  const {
    data: current,
    isLoading: currentLoading,
    isError: currentError,
    refetch: refetchCurrent,
  } = useCurrentRate()
  const {
    data: history,
    isLoading: historyLoading,
    isError: historyError,
    refetch: refetchHistory,
  } = useRateHistory(range)

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>{t('nav.exchange')}</h1>

      {currentLoading && <Spinner />}
      {currentError && <ErrorState onRetry={() => void refetchCurrent()} />}
      {!currentLoading && !currentError && !current && (
        <EmptyState title={t('exchange.noRateTitle')} body={t('exchange.noRateBody')} />
      )}
      {current && <RateHero current={current} />}

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>{t('exchange.history')}</h2>
          <RangeToggle value={range} onChange={setRange} />
        </div>
        {historyLoading && <Spinner />}
        {historyError && <ErrorState onRetry={() => void refetchHistory()} />}
        {history && <RateChart history={history} />}
      </section>

      <div className={styles.grid}>
        <CurrencyConverter rate={current?.rate ?? null} />
        <SmilesLink />
      </div>

      <AlertList currentRate={current?.rate ?? null} />
    </div>
  )
}
