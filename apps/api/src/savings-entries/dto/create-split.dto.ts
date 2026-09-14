import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNumberString,
  IsOptional,
  IsUUID,
  Length,
  ValidateNested,
} from 'class-validator';
import { Currency } from '@prisma/client';

const MAX_ALLOCATIONS = 20;

// Every `message` below is an i18n key translated on the frontend
// (`apiError.<key>`), never English prose — see auth/dto/register.dto.ts.
export class SplitAllocationDto {
  @IsUUID(undefined, { message: 'goalNotFound' })
  goalId!: string;

  @IsNumberString({}, { message: 'splitAmountInvalid' })
  amount!: string;

  @IsEnum(Currency, { message: 'goalCurrencyInvalid' })
  currency!: Currency;
}

export class CreateSplitDto {
  // Must not be in the future — enforced in SavingsEntriesService.
  @IsDateString({}, { message: 'entryDateInvalid' })
  entryDate!: string;

  @IsOptional()
  @Length(0, 500, { message: 'entryNoteTooLong' })
  note?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'splitAllocationsEmpty' })
  @ArrayMaxSize(MAX_ALLOCATIONS, { message: 'splitAllocationsTooMany' })
  @ValidateNested({ each: true })
  @Type(() => SplitAllocationDto)
  allocations!: SplitAllocationDto[];
}
