/**
 * Pure — no React, no i18n — so it can be unit-tested directly without
 * rendering. Kept in its own module (mirroring exchange-math.ts) rather than
 * exported alongside a component, which would break React Fast Refresh for
 * that file.
 *
 * A blank `total` means "no ceiling set": the only remaining guard is
 * "at least one row filled", which is what keeps /split usable as a cold
 * entry point where nobody has typed a total yet.
 */
export function computeSplitSummary(amounts: Record<string, string>, total: string) {
  const filled = Object.entries(amounts).filter(([, value]) => value.trim() !== '')
  const invalid = filled.some(([, value]) => !Number.isFinite(Number(value)) || Number(value) <= 0)
  const sum = filled.reduce((acc, [, value]) => {
    const n = Number(value)
    return acc + (Number.isFinite(n) ? n : 0)
  }, 0)
  const totalNum = total.trim() === '' ? null : Number(total)
  const hasCeiling = totalNum !== null && Number.isFinite(totalNum)
  const overAllocated = hasCeiling && sum > (totalNum as number)
  const leftToAllocate = hasCeiling ? (totalNum as number) - sum : null
  const canSubmit = filled.length > 0 && filled.length <= 20 && !invalid && !overAllocated
  return { sum, leftToAllocate, overAllocated, canSubmit, filledCount: filled.length }
}
