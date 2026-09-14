import { Trans, useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { LedgerList, LedgerRow } from '@/components/ui/ledger-list'
import { Money } from '@/components/ui/money'
import { Spinner } from '@/components/ui/spinner'
import type { AvailableBalanceConfigured, AvailableBalanceResponse, Currency, CountedGoal, ExcludedGoal } from '../budget.types'
import { useAvailableBalance } from '../hooks/use-available-balance'
import { AllocationSuggestion } from './allocation-suggestion'
import { resolveCardState } from './available-balance-state'
import styles from './available-balance-card.module.css'

export function AvailableBalanceCard() {
  const { data, isLoading, isError, refetch } = useAvailableBalance()

  return (
    <Card className={styles.card}>
      {isLoading && <Spinner />}
      {isError && <ErrorState onRetry={() => void refetch()} />}
      {data && <CardBody data={data} />}
    </Card>
  )
}

function CardBody({ data }: { data: AvailableBalanceResponse }) {
  const { t } = useTranslation()
  const state = resolveCardState(data)

  if (state === 'unconfigured') {
    return (
      <EmptyState
        title={t('budget.card.promptTitle')}
        body={t('budget.card.promptBody')}
        action={
          <Link to="/budget">
            <Button>{t('budget.card.promptCta')}</Button>
          </Link>
        }
      />
    )
  }

  // Both remaining branches share this shape — narrowed once here rather
  // than repeating the `data.configured` check in each branch below.
  const configured = data as AvailableBalanceConfigured

  if (state === 'rateUnavailable') {
    return (
      <>
        <h2 className={styles.title}>{t('budget.card.title')}</h2>
        <p className={styles.line}>
          {t('budget.form.income')}: <Money value={configured.monthlyIncome} currency={configured.budgetCurrency} />
        </p>
        <p className={styles.line}>
          {t('budget.card.fixedExpensesLabel')}:{' '}
          <Money value={configured.totalFixedExpenses} currency={configured.budgetCurrency} />
        </p>
        <p className={styles.muted}>{t('budget.card.rateUnavailableNote')}</p>
      </>
    )
  }

  const isShortfall = state === 'shortfall'
  const heroValue = (isShortfall ? configured.shortfall : configured.available) ?? '0'

  return (
    <>
      <h2 className={styles.title}>{t('budget.card.title')}</h2>
      <span className={styles.heroLabel}>
        {t(isShortfall ? 'budget.card.shortfallLabel' : 'budget.card.availableLabel')}
      </span>
      <Money
        value={heroValue}
        currency={configured.budgetCurrency}
        className={isShortfall ? styles.heroNegative : styles.heroPositive}
      />
      <p className={styles.formula}>{t('budget.card.formulaHint')}</p>

      <CountedList goals={configured.counted} budgetCurrency={configured.budgetCurrency} />
      {configured.excluded.length > 0 && <ExcludedList goals={configured.excluded} />}

      {isShortfall && (
        <AllocationSuggestion allocation={configured.allocation ?? []} currency={configured.budgetCurrency} />
      )}
    </>
  )
}

function CountedList({ goals, budgetCurrency }: { goals: CountedGoal[]; budgetCurrency: Currency }) {
  const { t } = useTranslation()

  return (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle}>{t('budget.card.countedTitle')}</h3>
      {goals.length === 0 ? (
        <p className={styles.muted}>{t('budget.card.countedEmpty')}</p>
      ) : (
        <LedgerList>
          {goals.map((goal) => (
            <LedgerRow key={goal.goalId} className={styles.row}>
              <span>{goal.name}</span>
              <span className={styles.rowAmount}>
                <Money value={goal.needInBudgetCurrency} currency={budgetCurrency} />
                {goal.goalCurrency !== budgetCurrency && (
                  <span className={styles.subLine}>
                    <Trans
                      i18nKey="budget.card.convertedFrom"
                      components={{ money: <Money value={goal.needInGoalCurrency} currency={goal.goalCurrency} /> }}
                    />
                  </span>
                )}
              </span>
            </LedgerRow>
          ))}
        </LedgerList>
      )}
    </div>
  )
}

function ExcludedList({ goals }: { goals: ExcludedGoal[] }) {
  const { t } = useTranslation()

  return (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle}>{t('budget.card.excludedTitle')}</h3>
      <LedgerList>
        {goals.map((goal) => (
          <LedgerRow key={goal.goalId} className={styles.row}>
            <span>{goal.name}</span>
            <span className={styles.muted}>{t(`budget.card.excludedReason.${goal.reason}`)}</span>
          </LedgerRow>
        ))}
      </LedgerList>
    </div>
  )
}
