import styles from './progress-bar.module.css'

interface ProgressBarProps {
  /** True percentage — may exceed 100. The bar visually caps at 100%. */
  percent: number
  size?: 'list' | 'hero'
  label?: string
}

export function ProgressBar({ percent, size = 'list', label }: ProgressBarProps) {
  const visualPercent = Math.min(100, Math.max(0, percent))
  return (
    <div
      className={styles.track}
      data-size={size}
      role="progressbar"
      aria-valuenow={Math.round(percent)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className={styles.fill} style={{ width: `${visualPercent}%` }} />
    </div>
  )
}
