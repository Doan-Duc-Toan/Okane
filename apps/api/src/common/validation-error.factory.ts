import { BadRequestException } from '@nestjs/common';
import type { ValidationError } from '@nestjs/common';

/**
 * Every DTO decorator in this app sets `message` to a short i18n key (e.g.
 * `'passwordTooWeak'`) instead of English prose — the frontend translates it
 * via `apiError.<key>` (see apps/web/src/lib/api-client.ts). This factory is
 * the other half of that contract: it flattens class-validator's nested
 * ValidationError tree into a flat `message: string[]` of those same keys,
 * and normalizes the one message class-validator generates itself (a
 * whitelist violation, e.g. "property foo should not exist") into a single
 * stable `unexpectedField` key, since that text isn't set via any decorator
 * and would otherwise leak untranslatable English straight to a user.
 */
export function validationExceptionFactory(errors: ValidationError[]): BadRequestException {
  const keys = errors.flatMap(collectKeys);
  return new BadRequestException(keys.length > 0 ? keys : ['invalidRequest']);
}

function collectKeys(error: ValidationError): string[] {
  const own = Object.entries(error.constraints ?? {}).map(([rule, message]) =>
    rule === 'whitelistValidation' ? 'unexpectedField' : message,
  );
  const nested = (error.children ?? []).flatMap(collectKeys);
  return [...own, ...nested];
}
