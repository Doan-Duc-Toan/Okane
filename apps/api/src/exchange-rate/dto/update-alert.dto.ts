import { IsBoolean, IsDecimal, IsEnum, IsOptional } from 'class-validator';
import { AlertDirection } from '@prisma/client';

// Every `message` below is an i18n key translated on the frontend
// (`apiError.<key>`), never English prose — see auth/dto/register.dto.ts.
export class UpdateAlertDto {
  @IsOptional()
  @IsEnum(AlertDirection, { message: 'alertDirectionInvalid' })
  direction?: AlertDirection;

  @IsOptional()
  @IsDecimal({ decimal_digits: '0,8' }, { message: 'alertThresholdInvalid' })
  threshold?: string;

  @IsOptional()
  @IsBoolean({ message: 'alertActiveInvalid' })
  active?: boolean;
}
