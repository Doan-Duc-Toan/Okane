/** Types mirroring Phase 4's frozen response contract. Money is always a string. */

export type Currency = 'JPY' | 'VND'

export type DeadlineStatus = 'on_track' | 'overdue' | 'no_deadline' | 'completed'

export interface ProgressBlock {
  savedAmount: string
  targetAmount: string
  currency: Currency
  progressPercent: number
  remainingAmount: string
  remainingInOtherCurrency: string | null
  otherCurrency: Currency
  rateUsed: string | null
  rateAsOf: string | null
  monthsRemaining: number | null
  suggestedMonthlyAmount: string | null
  deadlineStatus: DeadlineStatus
}

export interface Goal {
  id: string
  name: string
  targetAmount: string
  currency: Currency
  deadline: string | null
  createdAt: string
  progress: ProgressBlock
}

export interface Entry {
  id: string
  goalId: string
  amount: string
  currency: Currency
  entryDate: string
  note: string | null
  amountInGoalCurrency: string
  fxRateUsed: string | null
  createdAt: string
}

export interface EntryWithGoalName extends Entry {
  goalName: string
}

export interface CurrencyTotal {
  currency: Currency
  savedAmount: string
  targetAmount: string
  goalCount: number
}

export interface DashboardResponse {
  totals: CurrencyTotal[]
  goals: Goal[]
  recentEntries: EntryWithGoalName[]
}

export interface EntriesPage {
  entries: Entry[]
  nextCursor: string | null
}

export interface CreateGoalPayload {
  name: string
  targetAmount: string
  currency: Currency
  deadline?: string
}

export interface UpdateGoalPayload {
  name?: string
  targetAmount?: string
  deadline?: string | null
}

export interface CreateEntryPayload {
  amount: string
  currency: Currency
  entryDate: string
  note?: string
}

export interface UpdateEntryPayload {
  amount?: string
  currency?: Currency
  entryDate?: string
  note?: string
}
