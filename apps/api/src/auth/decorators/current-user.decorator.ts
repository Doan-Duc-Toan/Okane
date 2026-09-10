import { ExecutionContext, createParamDecorator } from '@nestjs/common';

export interface AuthenticatedUser {
  userId: string;
  email: string;
}

/**
 * Pulls the authenticated user off the request, populated by JwtStrategy.
 * Every user-scoped service takes userId as its first argument — this is
 * the single place that reads it off the HTTP layer.
 */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
  const request = ctx.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
  return request.user;
});
