import { IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { Locale, ThemePref } from '@prisma/client';

// Every `message` below is an i18n key translated on the frontend
// (`apiError.<key>`), never English prose — see auth/dto/register.dto.ts.
export class UpdateProfileDto {
  @IsOptional()
  @IsString({ message: 'displayNameInvalid' })
  @Length(1, 80, { message: 'displayNameTooLong' })
  displayName?: string;

  @IsOptional()
  @IsEnum(Locale, { message: 'localeInvalid' })
  locale?: Locale;

  @IsOptional()
  @IsEnum(ThemePref, { message: 'themeInvalid' })
  theme?: ThemePref;
}
