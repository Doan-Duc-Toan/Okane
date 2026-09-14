import type { ButtonHTMLAttributes } from 'react'
import styles from './button.module.css'

export type ButtonVariant = 'primary' | 'ghost' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  /** Shows an inline spinner and disables the button — the visible sign that
   *  a click actually did something, instead of the same static label
   *  sitting there for however long the request takes. */
  isLoading?: boolean
}

export function Button({ variant = 'primary', className, isLoading, disabled, children, ...rest }: ButtonProps) {
  const classes = [styles.button, styles[variant], className].filter(Boolean).join(' ')
  return (
    <button type="button" className={classes} disabled={disabled || isLoading} {...rest}>
      {isLoading && <span className={styles.spinner} aria-hidden="true" />}
      {children}
    </button>
  )
}
