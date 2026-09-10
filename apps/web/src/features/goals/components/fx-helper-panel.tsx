import { Trans, useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/card'
import { Money } from '@/components/ui/money'
import { formatDate } from '@/lib/format'
import type { ProgressBlock } from '../goals.types'
import styles from './fx-helper-panel.module.css'

/**
 * Three independent lines — "still need", cross-currency estimate, suggested
 * monthly amount. Each hides on its own when the underlying field is null;
 * never render "≈ null" or a zero placeholder (Phase 8's rule).
 */
export function FxHelperPanel({ progress }: { progress: ProgressBlock }) {
  const { t, i18n } = useTranslation()

  return (
    <Card className={styles.card}>
      <p className={styles.line}>
        {t('goal.stillNeed')}{' '}
        <Money value={progress.remainingAmount} currency={progress.currency} className={styles.emphasis} />
      </p>

      {progress.remainingInOtherCurrency && progress.rateAsOf ? (
        <p className={styles.line}>
          <Trans
            i18nKey="goal.approxOtherCurrency"
            values={{ date: formatDate(progress.rateAsOf, i18n.language) }}
            components={{
              money: <Money value={progress.remainingInOtherCurrency} currency={progress.otherCurrency} />,
            }}
          />
        </p>
      ) : (
        <p className={styles.muted}>{t('goal.noRateForConversion')}</p>
      )}

      {progress.suggestedMonthlyAmount && (
        <p className={styles.line}>
          {t('goal.suggestedMonthly')}{' '}
          <Money value={progress.suggestedMonthlyAmount} currency={progress.currency} className={styles.emphasis} />
        </p>
      )}
    </Card>
  )
}
