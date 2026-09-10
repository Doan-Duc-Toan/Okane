import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import styles from './delete-confirm-dialog.module.css'

interface DeleteConfirmDialogProps {
  message: string
  onConfirm: () => void
  onCancel: () => void
  pending?: boolean
}

/** Deletion is irreversible in MVP — the message names the consequences, never a bare "are you sure?". */
export function DeleteConfirmDialog({ message, onConfirm, onCancel, pending }: DeleteConfirmDialogProps) {
  const { t } = useTranslation()

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true">
      <div className={styles.dialog}>
        <p className={styles.message}>{message}</p>
        <div className={styles.actions}>
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={pending}>
            {t('common.delete')}
          </Button>
        </div>
      </div>
    </div>
  )
}
