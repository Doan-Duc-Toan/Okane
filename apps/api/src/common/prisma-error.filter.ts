import { ArgumentsHost, Catch, ConflictException, ExceptionFilter, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

/**
 * Maps Prisma's known request errors to HTTP responses so services don't have
 * to catch P2002/P2025 by hand at every call site.
 *  - P2002 (unique constraint violation) -> 409, naming the conflicting field
 *  - P2025 (record not found for update/delete) -> 404
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaClientExceptionFilter implements ExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception.code === 'P2002') {
      const target = (exception.meta?.target as string[] | undefined)?.join(', ') ?? 'field';
      const conflict = new ConflictException(`A record with this ${target} already exists`);
      const body = conflict.getResponse();
      response.status(conflict.getStatus()).json(body);
      return;
    }

    if (exception.code === 'P2025') {
      const notFound = new NotFoundException('Resource not found');
      const body = notFound.getResponse();
      response.status(notFound.getStatus()).json(body);
      return;
    }

    // Unknown Prisma error code — surface as a generic 500 rather than leaking
    // internals, but keep the message for server-side logs.
    response.status(500).json({ statusCode: 500, message: 'Internal server error' });
  }
}
