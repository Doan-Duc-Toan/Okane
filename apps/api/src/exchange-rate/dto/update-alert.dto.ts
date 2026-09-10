import { IsBoolean, IsDecimal, IsEnum, IsOptional } from 'class-validator';
import { AlertDirection } from '@prisma/client';

export class UpdateAlertDto {
  @IsOptional()
  @IsEnum(AlertDirection)
  direction?: AlertDirection;

  @IsOptional()
  @IsDecimal({ decimal_digits: '0,8' })
  threshold?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
