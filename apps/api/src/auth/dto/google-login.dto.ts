import { IsNotEmpty, IsString } from 'class-validator';

// Every `message` below is an i18n key translated on the frontend
// (`apiError.<key>`), never English prose — see login.dto.ts.
export class GoogleLoginDto {
  @IsString({ message: 'credentialRequired' })
  @IsNotEmpty({ message: 'credentialRequired' })
  credential!: string;
}
