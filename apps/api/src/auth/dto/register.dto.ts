import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

// Min 8 chars, at least one letter and one digit. No forced special char and
// no max below 72 bytes (bcrypt's own limit) — arbitrary complexity rules
// push users toward weaker, reused passwords.
const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).+$/;

// Every `message` below is a stable i18n key, not English prose — the
// frontend translates it via `apiError.<key>` (see api-client.ts). Never put
// user-facing English text directly in a decorator; it can't be localized.
export class RegisterDto {
  @IsEmail({}, { message: 'emailInvalid' })
  email!: string;

  @IsString({ message: 'passwordTooShort' })
  @MinLength(8, { message: 'passwordTooShort' })
  @MaxLength(72, { message: 'passwordTooLong' })
  @Matches(PASSWORD_PATTERN, { message: 'passwordWeak' })
  password!: string;

  @IsOptional()
  @IsString({ message: 'displayNameInvalid' })
  @MaxLength(80, { message: 'displayNameTooLong' })
  displayName?: string;
}
