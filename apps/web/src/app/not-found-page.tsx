import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

export function NotFoundPage() {
  const { t } = useTranslation()
  return (
    <EmptyState
      title={t('common.notFound.title')}
      body={t('common.notFound.body')}
      action={
        <Link to="/">
          <Button>{t('common.notFound.cta')}</Button>
        </Link>
      }
    />
  )
}
