import { useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { AmountInput } from '@/components/ui/amount-input'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import type { BudgetSettings, Currency, UpdateBudgetPayload } from '../budget.types'
import styles from './budget-form.module.css'

interface BudgetFormProps {
  initialValues?: BudgetSettings
  submitting?: boolean
  onSubmit: (values: UpdateBudgetPayload) => void
}

export function BudgetForm({ initialValues, submitting, onSubmit }: BudgetFormProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [monthlyIncome, setMonthlyIncome] = useState(initialValues?.monthlyIncome ?? '')
  const [expenseRent, setExpenseRent] = useState(initialValues?.expenseRent ?? '')
  const [expenseFood, setExpenseFood] = useState(initialValues?.expenseFood ?? '')
  const [expenseOther, setExpenseOther] = useState(initialValues?.expenseOther ?? '')
  const [currency, setCurrency] = useState<Currency>(initialValues?.currency ?? 'JPY')
  const [incomeError, setIncomeError] = useState<string | null>(null)
  const [rentError, setRentError] = useState<string | null>(null)
  const [foodError, setFoodError] = useState<string | null>(null)
  const [otherError, setOtherError] = useState<string | null>(null)

  function expenseErrorFor(value: string): string | null {
    const n = Number(value)
    if (!value.trim() || !Number.isFinite(n) || n < 0) return t('budget.form.error.expenseInvalid')
    return null
  }

  function validate(): boolean {
    const income = Number(monthlyIncome)
    const incomeErr =
      !monthlyIncome.trim() || !Number.isFinite(income) || income <= 0
        ? t('budget.form.error.incomeInvalid')
        : null
    const rentErr = expenseErrorFor(expenseRent)
    const foodErr = expenseErrorFor(expenseFood)
    const otherErr = expenseErrorFor(expenseOther)

    setIncomeError(incomeErr)
    setRentError(rentErr)
    setFoodError(foodErr)
    setOtherError(otherErr)

    return !incomeErr && !rentErr && !foodErr && !otherErr
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (submitting) return
    if (!validate()) return
    onSubmit({ monthlyIncome, expenseRent, expenseFood, expenseOther, currency })
  }

  return (
    <form onSubmit={handleSubmit} noValidate className={styles.form}>
      <AmountInput
        label={t('budget.form.income')}
        required
        value={monthlyIncome}
        onChange={setMonthlyIncome}
        error={incomeError ?? undefined}
      />
      <AmountInput
        label={t('budget.form.expenseRent')}
        required
        value={expenseRent}
        onChange={setExpenseRent}
        error={rentError ?? undefined}
      />
      <AmountInput
        label={t('budget.form.expenseFood')}
        required
        value={expenseFood}
        onChange={setExpenseFood}
        error={foodError ?? undefined}
      />
      <AmountInput
        label={t('budget.form.expenseOther')}
        required
        value={expenseOther}
        onChange={setExpenseOther}
        error={otherError ?? undefined}
      />
      <Select
        label={t('budget.form.currency')}
        options={[
          { value: 'JPY', label: t('currency.JPY') },
          { value: 'VND', label: t('currency.VND') },
        ]}
        value={currency}
        onChange={(e) => setCurrency(e.target.value as Currency)}
      />
      <div className={styles.actions}>
        <Button variant="ghost" type="button" onClick={() => navigate('/')} disabled={submitting}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" isLoading={submitting}>
          {t('budget.form.submit')}
        </Button>
      </div>
    </form>
  )
}
