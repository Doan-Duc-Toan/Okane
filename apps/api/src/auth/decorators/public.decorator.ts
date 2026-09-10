import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Opt-out of the global JwtAuthGuard. Registered as APP_GUARD, the guard
 * fails closed by default — any route without this decorator requires a
 * valid access token, including routes added by later phases.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
