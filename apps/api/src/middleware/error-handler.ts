import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

import { AppError, toErrorResponse } from '../utils/errors';
import { logger } from '../utils/logger';
import { mapPrismaError } from '../utils/prisma-errors';

export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction) {
  void _next;

  if (error instanceof ZodError) {
    const appError = new AppError(400, 'validation_error', 'Request validation failed.', error.flatten());
    return res.status(appError.statusCode).json(toErrorResponse(appError, req.requestId));
  }

  if (error instanceof AppError) {
    return res.status(error.statusCode).json(toErrorResponse(error, req.requestId));
  }

  const prismaError = mapPrismaError(error);
  if (prismaError) {
    logger.error(
      {
        err: error,
        request_id: req.requestId,
        tenant_id: req.tenant?.id ?? null,
      },
      'database_schema_not_ready',
    );
    return res.status(prismaError.statusCode).json(toErrorResponse(prismaError, req.requestId));
  }

  logger.error(
    {
      err: error,
      request_id: req.requestId,
      tenant_id: req.tenant?.id ?? null,
    },
    'unhandled_error',
  );

  const appError = new AppError(500, 'internal_error', 'An unexpected error occurred.');
  return res.status(appError.statusCode).json(toErrorResponse(appError, req.requestId));
}
