import type { Prisma } from '@prisma/client';
import type { DataScopeContext } from '../types/http';

import { prisma } from '../db/prisma';

export function siteScopedFilter(
  scope: DataScopeContext,
  siteField: string,
): Prisma.Sql | Record<string, never> | Record<string, unknown> {
  if (scope.isFullTenantScope) {
    return {};
  }

  if (scope.allowedSiteIds.length === 0) {
    return {
      [siteField]: {
        in: [],
      },
    };
  }

  return {
    [siteField]: {
      in: scope.allowedSiteIds,
    },
  };
}

export function applySiteScopeToWhere<T extends Record<string, unknown>>(
  where: T,
  scope: DataScopeContext,
  siteField: string,
): T {
  if (scope.isFullTenantScope) {
    return where;
  }

  if (scope.allowedSiteIds.length === 0) {
    return {
      ...where,
      [siteField]: { in: [] },
    } as T;
  }

  return {
    ...where,
    [siteField]: { in: scope.allowedSiteIds },
  } as T;
}

export async function recordOutOfScopeAuditLog(args: {
  tenantId: string;
  actorId: string;
  route: string;
  resourceType: string;
  resourceId: string;
}) {
  await prisma.auditLog.create({
    data: {
      tenantId: args.tenantId,
      actorId: args.actorId,
      actorType: 'STAFF',
      eventType: 'scope_access_denied',
      metadata: {
        route: args.route,
        resource_type: args.resourceType,
        resource_id: args.resourceId,
      },
    },
  });
}
