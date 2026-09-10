import { IsDecimal, IsEnum } from 'class-validator';
import { Currency } from '@prisma/client';

// Every `message` below is an i18n key translated on the frontend
// (`apiError.<key>`), never English prose — see auth/dto/register.dto.ts.
export class ConvertDto {
  @IsDecimal({ decimal_digits: '0,2' }, { message: 'entryAmountInvalid' })
  amount!: string;

  @IsEnum(Currency, { message: 'goalCurrencyInvalid' })
  from!: Currency;

  @IsEnum(Currency, { message: 'goalCurrencyInvalid' })
  to!: Currency;
}
