import type { NextFunction, Request, Response } from 'express';

import { AppError } from '../utils/errors';
import { verifyAccessToken } from '../utils/jwt';

export function platformAuthMiddleware(req: Request, _res: Response, next: NextFunction) {
  const header = req.header('authorization');

  if (!header?.startsWith('Bearer ')) {
    return next(new AppError(401, 'missing_auth', 'Authorization header is required.'));
  }

  const token = header.slice('Bearer '.length);

  try {
    const claims = verifyAccessToken(token);

    if (claims.actor_type !== 'PLATFORM' || claims.role !== 'PLATFORM_OWNER') {
      return next(new AppError(403, 'platform_auth_required', 'Platform owner access is required.'));
    }

    req.auth = claims;
    next();
  } catch {
    next(new AppError(401, 'invalid_token', 'Access token is invalid or expired.'));
  }
}
