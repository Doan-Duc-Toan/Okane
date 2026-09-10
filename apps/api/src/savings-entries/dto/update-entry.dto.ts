import { IsDateString, IsDecimal, IsEnum, IsOptional, Length } from 'class-validator';
import { Currency } from '@prisma/client';

// Updating amount/currency re-freezes the conversion at today's rate — this
// is a deliberate, documented exception to "frozen at logging time" (see
// SavingsEntriesService.update and the Phase 8 UI copy that surfaces it).
// Every `message` below is an i18n key translated on the frontend
// (`apiError.<key>`), never English prose — see auth/dto/register.dto.ts.
export class UpdateEntryDto {
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' }, { message: 'entryAmountInvalid' })
  amount?: string;

  @IsOptional()
  @IsEnum(Currency, { message: 'goalCurrencyInvalid' })
  currency?: Currency;

  @IsOptional()
  @IsDateString({}, { message: 'entryDateInvalid' })
  entryDate?: string;

  @IsOptional()
  @Length(0, 500, { message: 'entryNoteTooLong' })
  note?: string;
}
