import type { NextFunction, Request, Response } from 'express';

import { AppError } from '../utils/errors';
import { resolveTenant, resolveTenantFromSubdomain } from '../services/tenant.service';

export async function tenantMiddleware(req: Request, _res: Response, next: NextFunction) {
  try {
    const subdomain = resolveTenant(req);
    const tenant = await resolveTenantFromSubdomain(subdomain);

    if (!tenant) {
      return next(new AppError(404, 'tenant_not_found', 'Tenant could not be resolved from host.'));
    }

    req.tenant = tenant;
    next();
  } catch (error) {
    next(error);
  }
}
