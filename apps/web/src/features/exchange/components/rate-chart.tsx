import { useTranslation } from 'react-i18next'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { EmptyState } from '@/components/ui/empty-state'
import { useTheme } from '@/contexts/theme-context'
import { formatDate, formatRate } from '@/lib/format'
import type { HistoryResult } from '../exchange.types'
import styles from './rate-chart.module.css'

/**
 * `useTheme()` re-renders this component on every theme change, so a plain
 * (unmemoized) read of the CSS custom properties is enough to follow dark
 * mode — the read is a handful of cheap string lookups, not worth the extra
 * indirection of a memo keyed on a value the calculation doesn't otherwise use.
 */
function useChartColors() {
  useTheme()
  const computed = getComputedStyle(document.documentElement)
  const read = (name: string) => computed.getPropertyValue(name).trim()
  return {
    line: read('--color-primary'),
    grid: read('--color-line'),
    tooltipBg: read('--color-surface'),
    tooltipText: read('--color-ink'),
  }
}

/**
 * Handles the three `pointCount` cases from phase-09's table before any
 * styling: 0 → empty state, 1 → a single value with a caption (no axes), ≥2 →
 * a real line. Gaps in the data (a day the cron failed) are never
 * interpolated — the series simply has fewer points, and the line connects
 * only the observations that exist.
 */
export function RateChart({ history }: { history: HistoryResult }) {
  const { t, i18n } = useTranslation()
  const colors = useChartColors()

  if (history.pointCount === 0) {
    return <EmptyState title={t('exchange.chartEmptyTitle')} body={t('exchange.chartEmptyBody')} />
  }

  if (history.pointCount === 1) {
    const [point] = history.points
    return (
      <div className={styles.single}>
        <p className={styles.singleFigure}>{formatRate(point.rate, i18n.language)}</p>
        <p className={styles.singleCaption}>{formatDate(point.date, i18n.language)}</p>
        <p className={styles.coverageNote}>
          {t('exchange.coveragePartial', { date: formatDate(point.date, i18n.language) })}
        </p>
      </div>
    )
  }

  // Recharts plots numeric axes only — this cast is scoped to chart
  // rendering and never feeds a displayed figure, which always goes through
  // formatRate(string) below and in the tooltip formatter.
  const data = history.points.map((p) => ({ date: p.date, rate: Number(p.rate) }))

  return (
    <div className={styles.chartWrap}>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={colors.grid} vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(d: string) => formatDate(d, i18n.language)}
            stroke={colors.grid}
            tick={{ fill: colors.tooltipText, fontSize: 12 }}
          />
          <YAxis
            domain={['auto', 'auto']}
            tickFormatter={(v: number) => formatRate(String(v), i18n.language)}
            stroke={colors.grid}
            tick={{ fill: colors.tooltipText, fontSize: 12 }}
            width={64}
          />
          <Tooltip
            contentStyle={{ background: colors.tooltipBg, border: `1px solid ${colors.grid}`, color: colors.tooltipText }}
            labelFormatter={(d) => formatDate(String(d ?? ''), i18n.language)}
            formatter={(value) => [formatRate(String(value ?? ''), i18n.language), t('exchange.pairLabel')]}
          />
          <Line type="monotone" dataKey="rate" stroke={colors.line} strokeWidth={2} dot={false} connectNulls />
        </LineChart>
      </ResponsiveContainer>
      {history.coverage === 'partial' && (
        <p className={styles.coverageNote}>
          {t('exchange.coveragePartial', { date: formatDate(history.points[0].date, i18n.language) })}
        </p>
      )}
    </div>
  )
}
