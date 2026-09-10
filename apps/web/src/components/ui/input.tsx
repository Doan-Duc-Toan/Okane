import { useId } from 'react'
import type { InputHTMLAttributes, MouseEvent } from 'react'
import styles from './input.module.css'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
  hint?: string
}

export function Input({ label, error, hint, id, className, onClick, type, ...rest }: InputProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined

  function handleClick(e: MouseEvent<HTMLInputElement>) {
    onClick?.(e)
    // A native date input only opens its picker when the click lands
    // precisely on the small calendar glyph (desktop Chrome/Firefox) —
    // tapping anywhere else in the field does nothing. showPicker() makes
    // the whole field open the calendar, which is also just a more
    // reliable tap target on a phone/tablet than that glyph.
    if (type === 'date' && 'showPicker' in e.currentTarget) {
      try {
        e.currentTarget.showPicker()
      } catch {
        // Unsupported browser, or not called from a direct user gesture —
        // falls back to native click-the-glyph behavior, which still works.
      }
    }
  }

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        type={type}
        className={[styles.input, error && styles.inputError, className].filter(Boolean).join(' ')}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        onClick={handleClick}
        {...rest}
      />
      {hint && !error && (
        <p id={`${inputId}-hint`} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={`${inputId}-error`} className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
