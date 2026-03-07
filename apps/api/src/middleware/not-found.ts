import type { Request, Response } from 'express';

import { AppError, toErrorResponse } from '../utils/errors';

export function notFoundMiddleware(req: Request, res: Response) {
  const error = new AppError(404, 'route_not_found', 'Route not found.');
  res.status(error.statusCode).json(toErrorResponse(error, req.requestId));
}
