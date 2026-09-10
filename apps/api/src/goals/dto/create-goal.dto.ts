import { IsDateString, IsDecimal, IsEnum, IsOptional, Length } from 'class-validator';
import { Currency } from '@prisma/client';

// Money travels over the wire as a decimal-formatted string (never a JS
// number) and is parsed into Prisma's Decimal only inside the service layer.
// `targetAmount > 0` and `deadline` >= today are business rules enforced in
// GoalsService, not here — class-validator checks shape, the service checks
// domain meaning.
export class CreateGoalDto {
  @Length(1, 80)
  name!: string;

  @IsDecimal({ decimal_digits: '0,2' })
  targetAmount!: string;

  @IsEnum(Currency)
  currency!: Currency;

  @IsOptional()
  @IsDateString()
  deadline?: string;
}
