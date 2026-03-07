import { Router } from 'express';

import { platformLoginRequestSchema, tenantLoginRequestSchema } from '@fleet-fuel/shared';

import { loginRateLimitMiddleware } from '../middleware/rate-limit';
import { tenantMiddleware } from '../middleware/tenant';
import { loginTenantStaff } from '../services/auth.service';
import { loginPlatformOwner } from '../services/platform-auth.service';
import { asyncHandler } from '../utils/http';

export const authRouter = Router();

authRouter.post(
  '/platform-login',
  loginRateLimitMiddleware,
  asyncHandler(async (req, res) => {
    const payload = platformLoginRequestSchema.parse(req.body);
    const response = await loginPlatformOwner(payload);
    res.json(response);
  }),
);

authRouter.post(
  '/login',
  loginRateLimitMiddleware,
  tenantMiddleware,
  asyncHandler(async (req, res) => {
    const payload = tenantLoginRequestSchema.parse(req.body);
    const response = await loginTenantStaff(req.tenant!, payload);
    res.json(response);
  }),
);
