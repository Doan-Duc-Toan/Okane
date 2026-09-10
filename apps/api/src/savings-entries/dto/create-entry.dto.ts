import { IsDateString, IsDecimal, IsEnum, IsOptional, Length } from 'class-validator';
import { Currency } from '@prisma/client';

// Every `message` below is an i18n key translated on the frontend
// (`apiError.<key>`), never English prose — see auth/dto/register.dto.ts.
export class CreateEntryDto {
  @IsDecimal({ decimal_digits: '0,2' }, { message: 'entryAmountInvalid' })
  amount!: string;

  @IsEnum(Currency, { message: 'goalCurrencyInvalid' })
  currency!: Currency;

  // Must not be in the future — enforced in SavingsEntriesService.
  @IsDateString({}, { message: 'entryDateInvalid' })
  entryDate!: string;

  @IsOptional()
  @Length(0, 500, { message: 'entryNoteTooLong' })
  note?: string;
}
