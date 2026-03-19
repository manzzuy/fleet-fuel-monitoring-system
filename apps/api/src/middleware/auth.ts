import type { NextFunction, Request, Response } from 'express';
import type { UserRole } from '@fleet-fuel/shared';

import { AppError } from '../utils/errors';
import { verifyAccessToken } from '../utils/jwt';

export function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  const header = req.header('authorization');

  if (!header?.startsWith('Bearer ')) {
    return next(new AppError(401, 'missing_auth', 'Authorization header is required.'));
  }

  const token = header.slice('Bearer '.length);

  try {
    const claims = verifyAccessToken(token);

    if (!req.tenant) {
      return next(new AppError(500, 'tenant_context_missing', 'Tenant context was not initialized.'));
    }

    if (claims.actor_type === 'PLATFORM') {
      return next(new AppError(403, 'platform_token_forbidden', 'Platform tokens cannot access tenant routes.'));
    }

    if (claims.tenant_id !== req.tenant.id) {
      return next(new AppError(403, 'tenant_mismatch', 'Token tenant does not match the resolved tenant.'));
    }

    req.auth = claims;
    next();
  } catch {
    next(new AppError(401, 'invalid_token', 'Access token is invalid or expired.'));
  }
}

const STAFF_SURFACE_ROLES: UserRole[] = [
  'TENANT_ADMIN',
  'COMPANY_ADMIN',
  'SUPERVISOR',
  'SITE_SUPERVISOR',
  'SAFETY_OFFICER',
  'TRANSPORT_MANAGER',
  'HEAD_OFFICE_ADMIN',
];
const DRIVER_SURFACE_ROLES: UserRole[] = ['DRIVER'];

export function staffSurfaceAuthMiddleware(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) {
    return next(new AppError(500, 'auth_context_missing', 'Auth context was not initialized.'));
  }

  if (req.auth.actor_type !== 'STAFF' || !STAFF_SURFACE_ROLES.includes(req.auth.role as UserRole)) {
    return next(new AppError(403, 'forbidden_surface_access', 'This token cannot access staff/admin routes.'));
  }

  if (req.auth.force_password_change) {
    return next(
      new AppError(
        403,
        'password_change_required',
        'Password change is required before accessing staff/admin routes.',
      ),
    );
  }

  next();
}

export function driverSurfaceAuthMiddleware(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) {
    return next(new AppError(500, 'auth_context_missing', 'Auth context was not initialized.'));
  }

  if (req.auth.actor_type !== 'DRIVER' || !DRIVER_SURFACE_ROLES.includes(req.auth.role as UserRole)) {
    return next(new AppError(403, 'forbidden_surface_access', 'This token cannot access driver routes.'));
  }

  if (req.auth.force_password_change) {
    return next(
      new AppError(
        403,
        'password_change_required',
        'Password change is required before accessing driver routes.',
      ),
    );
  }

  next();
}
