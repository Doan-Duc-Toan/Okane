import { IsDateString, IsDecimal, IsEnum, IsOptional, Length } from 'class-validator';
import { Currency } from '@prisma/client';

// Updating amount/currency re-freezes the conversion at today's rate — this
// is a deliberate, documented exception to "frozen at logging time" (see
// SavingsEntriesService.update and the Phase 8 UI copy that surfaces it).
export class UpdateEntryDto {
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  amount?: string;

  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @IsOptional()
  @IsDateString()
  entryDate?: string;

  @IsOptional()
  @Length(0, 500)
  note?: string;
}
