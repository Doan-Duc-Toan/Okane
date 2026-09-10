import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/card'
import { formatDate, formatRate } from '@/lib/format'
import type { CurrentRate } from '../exchange.types'
import styles from './rate-hero.module.css'

/** The big current-rate figure — `asOf` is always visible (Phase 9's rule: a
 * number with no timestamp reads as live, and this rate updates once a day). */
export function RateHero({ current }: { current: CurrentRate }) {
  const { t, i18n } = useTranslation()

  return (
    <Card className={styles.card}>
      <p className={styles.figure}>
        {t('exchange.pairFigure', { rate: formatRate(current.rate, i18n.language) })}
      </p>
      <p className={styles.asOf}>{t('exchange.asOf', { date: formatDate(current.asOf, i18n.language) })}</p>
      {current.isStale && <p className={styles.stale}>{t('exchange.stale')}</p>}
      <p className={styles.sub}>{t('exchange.sub')}</p>
    </Card>
  )
}
