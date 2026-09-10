import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/card'
import styles from './smiles-link.module.css'

/** No public API — a plain outbound anchor (Phase 5's Key Insights). */
const SMILES_URL = 'https://www.smileswallet.com/japan/vi/'

export function SmilesLink() {
  const { t } = useTranslation()
  return (
    <Card className={styles.card}>
      <h3 className={styles.title}>{t('exchange.smilesTitle')}</h3>
      <p className={styles.desc}>{t('exchange.smilesDesc')}</p>
      <a href={SMILES_URL} target="_blank" rel="noopener noreferrer" className={styles.link}>
        {t('exchange.smilesCta')}
      </a>
    </Card>
  )
}
