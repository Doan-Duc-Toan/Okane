import { IsString } from 'class-validator';

export class RefreshDto {
  @IsString({ message: 'refreshTokenInvalid' })
  refreshToken!: string;
}
