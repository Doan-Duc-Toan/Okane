import { useEffect, useState } from 'react'
import type { ChangeEvent, FocusEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { resolveLocale } from '@/lib/format'
import { parseFlexibleAmount } from '@/lib/parse-amount'
import { Input } from './input'

interface AmountInputProps {
  id?: string
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  required?: boolean
  autoFocus?: boolean
  /** Defaults to a translated example ("VD: 1.000.000 hoặc 1 triệu, 1 tỷ")
   *  demonstrating the shorthand grammar below — override only when a
   *  call site needs a more specific example than the generic one. */
  placeholder?: string
}

/**
 * A money-amount field that accepts what a person actually types instead of
 * demanding they count zeros: thousands-grouped digits ("1,000,000,000" or
 * the Vietnamese "1.000.000.000"), or shorthand like "1 tỷ" / "1ty" / "500k"
 * / "2.5m" — see lib/parse-amount.ts. Shows the raw canonical number while
 * focused (grouping a value mid-edit fights the cursor) and a nicely grouped
 * rendering once the field blurs.
 *
 * `value`/`onChange` carry the plain canonical number as a string (e.g.
 * "1000000000") — the same shape every consumer already used with a plain
 * `<Input type="number">`, so swapping this in is a drop-in replacement.
 * On an unparseable blur, the raw text is passed through unchanged rather
 * than silently discarded, so the caller's existing required/positive
 * validation still catches it and shows its own message.
 */
export function AmountInput({
  id,
  label,
  value,
  onChange,
  error,
  required,
  autoFocus,
  placeholder,
}: AmountInputProps) {
  const { t, i18n } = useTranslation()
  const [displayValue, setDisplayValue] = useState(() => formatForDisplay(value, i18n.language))
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setDisplayValue(formatForDisplay(value, i18n.language))
  }, [value, i18n.language, focused])

  function handleFocus(e: FocusEvent<HTMLInputElement>) {
    setFocused(true)
    setDisplayValue(value)
    e.target.select()
  }

  function handleBlur() {
    setFocused(false)
    const parsed = parseFlexibleAmount(displayValue)
    if (parsed !== null) {
      const canonical = String(parsed)
      onChange(canonical)
      setDisplayValue(formatForDisplay(canonical, i18n.language))
    } else {
      // Couldn't parse — hand the raw text through unchanged so the
      // caller's own required/positive validation catches it instead of
      // this component silently reverting to the last valid value.
      onChange(displayValue)
    }
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    setDisplayValue(e.target.value)
  }

  return (
    <Input
      id={id}
      label={label}
      type="text"
      // Not inputMode="decimal" — that forces a digits-only keypad on iOS/Android,
      // which blocks the whole point of this field: shorthand like "1.5 tỷ" or
      // "500k" needs a real keyboard with letters, not just numbers.
      inputMode="text"
      autoComplete="off"
      autoFocus={autoFocus}
      required={required}
      placeholder={placeholder ?? t('field.amountPlaceholder')}
      value={displayValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      error={error}
    />
  )
}

function formatForDisplay(canonical: string, language: string): string {
  if (!canonical.trim()) return ''
  const num = Number(canonical)
  if (!Number.isFinite(num)) return canonical
  return new Intl.NumberFormat(resolveLocale(language), { maximumFractionDigits: 2 }).format(num)
}
