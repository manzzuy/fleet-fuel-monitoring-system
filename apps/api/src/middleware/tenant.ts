import type { NextFunction, Request, Response } from 'express';

import { AppError } from '../utils/errors';
import { getEffectiveHost, resolveTenantFromHost } from '../services/tenant.service';

export async function tenantMiddleware(req: Request, _res: Response, next: NextFunction) {
  try {
    const host = getEffectiveHost(req.headers.host, req.headers['x-forwarded-host']);
    const tenant = await resolveTenantFromHost(host);

    if (!tenant) {
      return next(new AppError(404, 'tenant_not_found', 'Tenant could not be resolved from host.'));
    }

    req.tenant = tenant;
    next();
  } catch (error) {
    next(error);
  }
}
