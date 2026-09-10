import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { LedgerList, LedgerRow } from '@/components/ui/ledger-list'
import { Money } from '@/components/ui/money'
import { formatDate, formatRate } from '@/lib/format'
import { useDeleteEntry } from '../hooks/use-entry-mutations'
import { useEntries } from '../hooks/use-goal'
import type { Currency } from '../goals.types'
import { DeleteConfirmDialog } from './delete-confirm-dialog'
import styles from './entry-history-list.module.css'

export function EntryHistoryList({ goalId, goalCurrency }: { goalId: string; goalCurrency: Currency }) {
  const { t, i18n } = useTranslation()
  const { data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } = useEntries(goalId)
  const deleteEntry = useDeleteEntry(goalId)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  if (isLoading) return null

  const entries = data?.pages.flatMap((page) => page.entries) ?? []
  if (entries.length === 0) {
    return <EmptyState title={t('goal.noEntries')} body="" />
  }

  const otherCurrency: Currency = goalCurrency === 'JPY' ? 'VND' : 'JPY'

  return (
    <>
      <LedgerList>
        {entries.map((entry) => (
          <LedgerRow key={entry.id} className={styles.row}>
            <div>
              <p className={styles.date}>{formatDate(entry.entryDate, i18n.language)}</p>
              {entry.note && <p className={styles.note}>{entry.note}</p>}
            </div>
            <div className={styles.amountBlock}>
              <Money value={entry.amount} currency={entry.currency} className={styles.amount} />
              {entry.fxRateUsed && (
                <p className={styles.converted}>
                  {'→ '}
                  <Money value={entry.amountInGoalCurrency} currency={otherCurrency} />
                  {' @ '}
                  {formatRate(entry.fxRateUsed, i18n.language)}
                </p>
              )}
            </div>
            <Button variant="ghost" onClick={() => setPendingDeleteId(entry.id)}>
              {t('common.delete')}
            </Button>
          </LedgerRow>
        ))}
      </LedgerList>
      {hasNextPage && (
        <Button variant="ghost" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>
          {t('goal.loadMore')}
        </Button>
      )}
      {deleteError && (
        <p role="alert" className={styles.deleteError}>
          {deleteError}
        </p>
      )}
      {pendingDeleteId && (
        <DeleteConfirmDialog
          message={t('goal.deleteEntryConfirm')}
          pending={deleteEntry.isPending}
          onCancel={() => setPendingDeleteId(null)}
          onConfirm={() =>
            deleteEntry.mutate(pendingDeleteId, {
              onSuccess: () => {
                setPendingDeleteId(null)
                setDeleteError(null)
              },
              onError: () => {
                setPendingDeleteId(null)
                setDeleteError(t('common.somethingWrong'))
              },
            })
          }
        />
      )}
    </>
  )
}
