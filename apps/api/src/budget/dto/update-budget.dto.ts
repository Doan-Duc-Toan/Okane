import { IsDecimal, IsEnum } from 'class-validator';
import { Currency } from '@prisma/client';

// Money travels over the wire as a decimal-formatted string (never a JS
// number), parsed into Prisma's Decimal only inside the service layer — see
// CreateGoalDto. Every `message` below is an i18n key translated on the
// frontend (`apiError.<key>`), never English prose.
export class UpdateBudgetDto {
  @IsDecimal({ decimal_digits: '0,2' }, { message: 'budgetIncomeInvalid' })
  monthlyIncome!: string;

  @IsDecimal({ decimal_digits: '0,2' }, { message: 'budgetExpenseInvalid' })
  expenseRent!: string;

  @IsDecimal({ decimal_digits: '0,2' }, { message: 'budgetExpenseInvalid' })
  expenseFood!: string;

  @IsDecimal({ decimal_digits: '0,2' }, { message: 'budgetExpenseInvalid' })
  expenseOther!: string;

  @IsEnum(Currency, { message: 'budgetCurrencyInvalid' })
  currency!: Currency;
}
