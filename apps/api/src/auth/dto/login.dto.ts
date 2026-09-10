import { IsEmail, IsString } from 'class-validator';

// Every `message` below is an i18n key translated on the frontend
// (`apiError.<key>`), never English prose — see register.dto.ts.
export class LoginDto {
  @IsEmail({}, { message: 'emailInvalid' })
  email!: string;

  @IsString({ message: 'passwordRequired' })
  password!: string;
}
