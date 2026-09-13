import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';

export interface GoogleIdentity {
  sub: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

/**
 * The only place google-auth-library is imported — an injectable seam so tests can fake
 * verification instead of either minting real Google tokens (impossible) or hitting Google's
 * cert endpoint over the network (flaky).
 */
@Injectable()
export class GoogleTokenVerifier {
  private readonly logger = new Logger(GoogleTokenVerifier.name);
  private readonly clientId?: string;
  private readonly client: OAuth2Client;

  constructor(config: ConfigService) {
    this.clientId = config.get<string>('GOOGLE_CLIENT_ID');
    this.client = new OAuth2Client();
  }

  get isConfigured(): boolean {
    return !!this.clientId;
  }

  async verify(credential: string): Promise<GoogleIdentity> {
    try {
      const ticket = await this.client.verifyIdToken({
        idToken: credential,
        audience: this.clientId,
      });
      const payload = ticket.getPayload();
      if (!payload) throw new Error('empty payload');
      return {
        sub: payload.sub,
        email: payload.email ?? null,
        emailVerified: payload.email_verified === true,
        name: payload.name ?? null,
      };
    } catch (err) {
      // verifyIdToken's rejections are plain, version-unstable Error messages
      // ("Wrong recipient", "Token used too late", ...) — never branch on them,
      // map every failure to the same key. Log the real message for diagnosis.
      this.logger.warn(`Google token verification failed: ${(err as Error).message}`);
      throw new UnauthorizedException('googleTokenInvalid');
    }
  }
}
