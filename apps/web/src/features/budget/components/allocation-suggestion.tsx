import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { LedgerList, LedgerRow } from '@/components/ui/ledger-list'
import { Money } from '@/components/ui/money'
import type { AllocationLine, Currency, SplitRouterState } from '../budget.types'
import styles from './allocation-suggestion.module.css'

interface AllocationSuggestionProps {
  /** Already sorted nearest-deadline-first by the server — rendered as-is. */
  allocation: AllocationLine[]
  currency: Currency
}

/**
 * Apply only navigates, it never mutates. The suggestion is recalculated
 * every time this card is viewed; nothing is written until the user reviews
 * the pre-filled split form at `/split` and submits it themselves.
 */
export function AllocationSuggestion({ allocation, currency }: AllocationSuggestionProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  function handleApply() {
    const state: SplitRouterState = {
      allocations: allocation.map((line) => ({ goalId: line.goalId, amount: line.amount })),
      currency,
    }
    navigate('/split', { state })
  }

  return (
    <div className={styles.wrap}>
      <h3 className={styles.title}>{t('budget.allocation.title')}</h3>
      <p className={styles.explain}>{t('budget.allocation.explain')}</p>

      {allocation.length === 0 ? (
        <p className={styles.muted}>{t('budget.allocation.emptyList')}</p>
      ) : (
        <>
          <LedgerList>
            {allocation.map((line) => (
              <LedgerRow key={line.goalId} className={styles.row}>
                <span>{line.name}</span>
                <span className={styles.rowAmount}>
                  <Money value={line.amount} currency={currency} />
                  {line.coveredFully && (
                    <span className={styles.covered}>{t('budget.allocation.coveredFully')}</span>
                  )}
                </span>
              </LedgerRow>
            ))}
          </LedgerList>
          <Button onClick={handleApply}>{t('budget.allocation.apply')}</Button>
        </>
      )}
    </div>
  )
}
