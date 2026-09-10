import { IsDateString, IsDecimal, IsEnum, IsOptional, Length } from 'class-validator';
import { Currency } from '@prisma/client';

export class CreateEntryDto {
  @IsDecimal({ decimal_digits: '0,2' })
  amount!: string;

  @IsEnum(Currency)
  currency!: Currency;

  // Must not be in the future — enforced in SavingsEntriesService.
  @IsDateString()
  entryDate!: string;

  @IsOptional()
  @Length(0, 500)
  note?: string;
}
