import { IsBoolean, IsDecimal, IsEnum, IsOptional } from 'class-validator';
import { AlertDirection } from '@prisma/client';

export class CreateAlertDto {
  @IsEnum(AlertDirection)
  direction!: AlertDirection;

  // threshold > 0 is enforced in RateAlertsService, not here.
  @IsDecimal({ decimal_digits: '0,8' })
  threshold!: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
