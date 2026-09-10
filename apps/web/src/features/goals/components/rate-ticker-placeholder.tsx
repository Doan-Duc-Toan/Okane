import styles from './rate-ticker-placeholder.module.css'

/**
 * Temporary stand-in for Phase 9's real RateTicker (agreed props shape:
 * none — it fetches its own current-rate query). Swapped out, not restructured,
 * once Phase 9 lands.
 */
export function RateTickerPlaceholder() {
  return <div className={styles.placeholder} aria-hidden="true" />
}
