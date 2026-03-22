import { Router } from 'express';

import {
  platformLoginRequestSchema,
  tenantChangePasswordRequestSchema,
  tenantLoginRequestSchema,
  tenantPasswordResetRequestSchema,
} from '@fleet-fuel/shared';

import { authMiddleware } from '../middleware/auth';
import { loginRateLimitMiddleware } from '../middleware/rate-limit';
import { tenantMiddleware } from '../middleware/tenant';
import { changeTenantStaffPassword, loginTenantStaff, requestTenantPasswordReset } from '../services/auth.service';
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

authRouter.post(
  '/change-password',
  loginRateLimitMiddleware,
  tenantMiddleware,
  authMiddleware,
  asyncHandler(async (req, res) => {
    const payload = tenantChangePasswordRequestSchema.parse(req.body);
    const response = await changeTenantStaffPassword(req.tenant!, req.auth!.sub, payload);
    res.json(response);
  }),
);

authRouter.post(
  '/request-password-reset',
  loginRateLimitMiddleware,
  tenantMiddleware,
  asyncHandler(async (req, res) => {
    const payload = tenantPasswordResetRequestSchema.parse(req.body);
    const response = await requestTenantPasswordReset(req.tenant!, payload, req.ip);
    res.status(202).json(response);
  }),
);

authRouter.post(
  '/reset-request',
  loginRateLimitMiddleware,
  tenantMiddleware,
  asyncHandler(async (req, res) => {
    const payload = tenantPasswordResetRequestSchema.parse(req.body);
    const response = await requestTenantPasswordReset(req.tenant!, payload, req.ip);
    res.status(202).json(response);
  }),
);
