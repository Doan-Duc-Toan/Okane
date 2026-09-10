import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { formatDate, formatRate } from '@/lib/format'
import { useCurrentRate } from '../hooks/use-current-rate'
import styles from './rate-ticker.module.css'

/**
 * Persistent top band across every authenticated screen (mockup convention),
 * not just the dashboard or the exchange page — the dashboard's placeholder
 * slot is retired in favor of this, mounted once in AppShell. Shares
 * `useCurrentRate`'s query key with the exchange page, so having the ticker
 * mounted everywhere still issues only one `/rates/current` request.
 */
export function RateTicker() {
  const { t, i18n } = useTranslation()
  const { data: current } = useCurrentRate()

  // No snapshot collected yet — nothing honest to show; the exchange page's
  // empty state carries that message instead of a decorative band guessing.
  if (!current) return null

  return (
    <Link to="/exchange" className={styles.ticker}>
      <span className={styles.figure}>
        {t('exchange.pairFigure', { rate: formatRate(current.rate, i18n.language) })}
      </span>
      <span className={styles.asOf}>{t('exchange.tickerAsOf', { date: formatDate(current.asOf, i18n.language) })}</span>
      {current.isStale && <span className={styles.stale}>{t('exchange.stale')}</span>}
    </Link>
  )
}
