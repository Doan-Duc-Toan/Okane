import { IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { Locale, ThemePref } from '@prisma/client';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Length(1, 80)
  displayName?: string;

  @IsOptional()
  @IsEnum(Locale)
  locale?: Locale;

  @IsOptional()
  @IsEnum(ThemePref)
  theme?: ThemePref;
}
