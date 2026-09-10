import { IsDateString, IsDecimal, IsEnum, IsOptional, Length } from 'class-validator';
import { Currency } from '@prisma/client';

// Money travels over the wire as a decimal-formatted string (never a JS
// number) and is parsed into Prisma's Decimal only inside the service layer.
// `targetAmount > 0` and `deadline` >= today are business rules enforced in
// GoalsService, not here — class-validator checks shape, the service checks
// domain meaning.
// Every `message` below is an i18n key translated on the frontend
// (`apiError.<key>`), never English prose — see register.dto.ts.
export class CreateGoalDto {
  @Length(1, 80, { message: 'goalNameInvalid' })
  name!: string;

  @IsDecimal({ decimal_digits: '0,2' }, { message: 'goalTargetAmountInvalid' })
  targetAmount!: string;

  @IsEnum(Currency, { message: 'goalCurrencyInvalid' })
  currency!: Currency;

  @IsOptional()
  @IsDateString({}, { message: 'goalDeadlineInvalid' })
  deadline?: string;
}
