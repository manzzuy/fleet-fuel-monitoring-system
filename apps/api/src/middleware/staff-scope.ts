import type { NextFunction, Request, Response } from 'express';

import { AppError } from '../utils/errors';
import { resolveDataScope } from '../services/data-scope.service';

export async function staffScopeMiddleware(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.tenant) {
      return next(new AppError(500, 'tenant_context_missing', 'Tenant context was not initialized.'));
    }

    if (!req.auth) {
      return next(new AppError(500, 'auth_context_missing', 'Auth context was not initialized.'));
    }

    req.dataScope = await resolveDataScope(req.tenant.id, req.auth);
    return next();
  } catch (error) {
    return next(error);
  }
}
