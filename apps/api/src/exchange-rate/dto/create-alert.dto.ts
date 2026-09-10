import { IsBoolean, IsDecimal, IsEnum, IsOptional } from 'class-validator';
import { AlertDirection } from '@prisma/client';

// Every `message` below is an i18n key translated on the frontend
// (`apiError.<key>`), never English prose — see auth/dto/register.dto.ts.
export class CreateAlertDto {
  @IsEnum(AlertDirection, { message: 'alertDirectionInvalid' })
  direction!: AlertDirection;

  // threshold > 0 is enforced in RateAlertsService, not here.
  @IsDecimal({ decimal_digits: '0,8' }, { message: 'alertThresholdInvalid' })
  threshold!: string;

  @IsOptional()
  @IsBoolean({ message: 'alertActiveInvalid' })
  active?: boolean;
}
