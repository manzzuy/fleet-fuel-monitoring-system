import { rateLimit } from 'express-rate-limit';

import { AppError } from '../utils/errors';

export const loginRateLimitMiddleware = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(new AppError(429, 'rate_limit_exceeded', 'Too many login attempts. Please try again later.'));
  },
});
