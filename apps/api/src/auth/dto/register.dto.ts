import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

// Min 8 chars, at least one letter and one digit. No forced special char and
// no max below 72 bytes (bcrypt's own limit) — arbitrary complexity rules
// push users toward weaker, reused passwords.
const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).+$/;

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(PASSWORD_PATTERN, { message: 'Password must contain at least one letter and one digit' })
  password!: string;
}
