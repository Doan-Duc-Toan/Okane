import { IsDecimal, IsEnum } from 'class-validator';
import { Currency } from '@prisma/client';

export class ConvertDto {
  @IsDecimal({ decimal_digits: '0,2' })
  amount!: string;

  @IsEnum(Currency)
  from!: Currency;

  @IsEnum(Currency)
  to!: Currency;
}
