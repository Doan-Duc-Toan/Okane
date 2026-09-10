import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { LedgerList, LedgerRow } from '@/components/ui/ledger-list'
import { Spinner } from '@/components/ui/spinner'
import { formatDate, formatRate } from '@/lib/format'
import { useAlerts, useDeleteAlert, useUpdateAlert } from '../hooks/use-alert-mutations'
import { AlertForm } from './alert-form'
import styles from './alert-list.module.css'

/** Mirrors the server's per-user cap (Phase 5) so the UI can refuse locally
 * with a clear message instead of surfacing a raw 400. */
const MAX_ALERTS_PER_USER = 10

export function AlertList({ currentRate }: { currentRate: string | null }) {
  const { t, i18n } = useTranslation()
  const { data, isLoading, isError, refetch } = useAlerts()
  const updateAlert = useUpdateAlert()
  const deleteAlert = useDeleteAlert()
  const [showForm, setShowForm] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  if (isLoading) return <Spinner />
  if (isError) return <ErrorState onRetry={() => void refetch()} />

  const alerts = data ?? []
  const atCap = alerts.length >= MAX_ALERTS_PER_USER

  return (
    <Card className={styles.card}>
      <div className={styles.head}>
        <h2 className={styles.title}>{t('exchange.alerts')}</h2>
        <Button variant="ghost" onClick={() => setShowForm(true)} disabled={atCap || showForm}>
          {t('exchange.addAlert')}
        </Button>
      </div>
      {atCap && <p className={styles.capNote}>{t('exchange.alertsCap')}</p>}
      {actionError && (
        <p role="alert" className={styles.actionError}>
          {actionError}
        </p>
      )}
      {showForm && (
        <AlertForm
          currentRate={currentRate}
          onCancel={() => setShowForm(false)}
          onCreated={() => setShowForm(false)}
        />
      )}
      {alerts.length === 0 ? (
        <EmptyState title={t('exchange.alertsEmptyTitle')} body={t('exchange.alertsEmptyBody')} />
      ) : (
        <LedgerList>
          {alerts.map((alert) => (
            <LedgerRow key={alert.id} className={styles.row}>
              <div className={styles.info}>
                <p className={styles.rule}>
                  {t(alert.direction === 'ABOVE' ? 'exchange.ruleAbove' : 'exchange.ruleBelow', {
                    threshold: formatRate(alert.threshold, i18n.language),
                  })}
                </p>
                <p className={styles.cadence}>{t('exchange.checkedDaily')}</p>
                {alert.lastTriggeredAt && (
                  <p className={styles.triggered}>
                    {t('exchange.lastTriggered', {
                      date: formatDate(alert.lastTriggeredAt, i18n.language),
                      rate: alert.lastTriggeredRate ? formatRate(alert.lastTriggeredRate, i18n.language) : '—',
                    })}
                  </p>
                )}
              </div>
              <div className={styles.actions}>
                <label className={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={alert.active}
                    onChange={(e) =>
                      updateAlert.mutate(
                        { id: alert.id, payload: { active: e.target.checked } },
                        { onError: () => setActionError(t('common.somethingWrong')) },
                      )
                    }
                  />
                  {t('exchange.active')}
                </label>
                <Button
                  variant="ghost"
                  onClick={() =>
                    deleteAlert.mutate(alert.id, { onError: () => setActionError(t('common.somethingWrong')) })
                  }
                >
                  {t('common.delete')}
                </Button>
              </div>
            </LedgerRow>
          ))}
        </LedgerList>
      )}
    </Card>
  )
}
