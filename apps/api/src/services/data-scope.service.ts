import type { AuthContext, DataScopeContext } from '../types/http';

import { prisma } from '../db/prisma';

function normalizeScope(siteIds: string[]): DataScopeContext {
  const uniqueIds = [...new Set(siteIds)];
  if (uniqueIds.length === 0) {
    return {
      isFullTenantScope: false,
      allowedSiteIds: [],
      scopeStatus: 'no_site_scope_assigned',
    };
  }

  return {
    isFullTenantScope: false,
    allowedSiteIds: uniqueIds,
    scopeStatus: 'site_scope_limited',
  };
}

export async function resolveDataScope(tenantId: string, auth: AuthContext): Promise<DataScopeContext> {
  if (auth.actor_type !== 'STAFF') {
    return {
      isFullTenantScope: true,
      allowedSiteIds: [],
      scopeStatus: 'full_tenant_scope',
    };
  }

  if (
    auth.role === 'HEAD_OFFICE_ADMIN' ||
    auth.role === 'TRANSPORT_MANAGER' ||
    auth.role === 'COMPANY_ADMIN' ||
    auth.role === 'SUPERVISOR'
  ) {
    return {
      isFullTenantScope: true,
      allowedSiteIds: [],
      scopeStatus: 'full_tenant_scope',
    };
  }

  if (auth.role !== 'SITE_SUPERVISOR') {
    return {
      isFullTenantScope: false,
      allowedSiteIds: [],
      scopeStatus: 'no_site_scope_assigned',
    };
  }

  const [assignments, legacyAssignments] = await Promise.all([
    prisma.userSiteAssignment.findMany({
      where: {
        tenantId,
        userId: auth.sub,
      },
      select: {
        siteId: true,
      },
    }),
    prisma.supervisorSite.findMany({
      where: {
        tenantId,
        supervisorUserId: auth.sub,
      },
      select: {
        siteId: true,
      },
    }),
  ]);

  return normalizeScope([...assignments.map((item) => item.siteId), ...legacyAssignments.map((item) => item.siteId)]);
}
