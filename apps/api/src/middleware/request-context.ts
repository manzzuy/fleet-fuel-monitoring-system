import { randomUUID } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';

import { logger } from '../utils/logger';

export function requestContextMiddleware(req: Request, res: Response, next: NextFunction) {
  req.requestId = req.header('x-request-id') ?? randomUUID();
  res.setHeader('x-request-id', req.requestId);

  const startedAt = Date.now();

  res.on('finish', () => {
    logger.info(
      {
        request_id: req.requestId,
        method: req.method,
        path: req.originalUrl,
        status_code: res.statusCode,
        duration_ms: Date.now() - startedAt,
        tenant_id: req.tenant?.id ?? null,
      },
      'request_completed',
    );
  });

  next();
}
