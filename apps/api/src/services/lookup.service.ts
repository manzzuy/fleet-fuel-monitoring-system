import { prisma } from '../db/prisma';
import type { DataScopeContext } from '../types/http';

export async function listTenantVehicles(tenantId: string, scope: DataScopeContext, search?: string, limit = 50) {
  if (!scope.isFullTenantScope && scope.allowedSiteIds.length === 0) {
    return [];
  }

  return prisma.vehicle.findMany({
    where: {
      tenantId,
      ...(!scope.isFullTenantScope
        ? {
            siteId: {
              in: scope.allowedSiteIds,
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { fleetNumber: { contains: search, mode: 'insensitive' } },
              { plateNumber: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: 'desc' }],
    take: Math.min(Math.max(limit, 1), 100),
    include: {
      site: {
        select: {
          id: true,
          siteCode: true,
          siteName: true,
        },
      },
    },
  });
}

export async function listTenantDrivers(tenantId: string, scope: DataScopeContext, search?: string, limit = 50) {
  if (!scope.isFullTenantScope && scope.allowedSiteIds.length === 0) {
    return [];
  }

  const searchClauses = search
    ? [
        { fullName: { contains: search, mode: 'insensitive' as const } },
        { employeeNo: { contains: search, mode: 'insensitive' as const } },
        { username: { contains: search, mode: 'insensitive' as const } },
      ]
    : [];

  return prisma.user.findMany({
    where: {
      tenantId,
      role: { in: ['DRIVER', 'SITE_SUPERVISOR'] },
      ...(!scope.isFullTenantScope
        ? {
            OR: [
              {
                siteAssignments: {
                  some: {
                    siteId: { in: scope.allowedSiteIds },
                  },
                },
              },
              {
                supervisedSites: {
                  some: {
                    siteId: { in: scope.allowedSiteIds },
                  },
                },
              },
              {
                dailyChecksAsDriver: {
                  some: {
                    siteId: { in: scope.allowedSiteIds },
                  },
                },
              },
              {
                fuelEntriesAsDriver: {
                  some: {
                    siteId: { in: scope.allowedSiteIds },
                  },
                },
              },
            ],
          }
        : {}),
      ...(searchClauses.length > 0
        ? {
            AND: [
              {
                OR: searchClauses,
              },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: 'desc' }],
    take: Math.min(Math.max(limit, 1), 100),
    select: {
      id: true,
      fullName: true,
      employeeNo: true,
      username: true,
    },
  });
}

export async function listTenantSites(tenantId: string, scope: DataScopeContext, search?: string, limit = 50) {
  if (!scope.isFullTenantScope && scope.allowedSiteIds.length === 0) {
    return [];
  }

  return prisma.site.findMany({
    where: {
      tenantId,
      ...(!scope.isFullTenantScope
        ? {
            id: {
              in: scope.allowedSiteIds,
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { siteCode: { contains: search, mode: 'insensitive' } },
              { siteName: { contains: search, mode: 'insensitive' } },
              { location: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: 'desc' }],
    take: Math.min(Math.max(limit, 1), 100),
    select: {
      id: true,
      siteCode: true,
      siteName: true,
      location: true,
      isActive: true,
    },
  });
}

export async function listTenantTanks(tenantId: string, scope: DataScopeContext, search?: string, limit = 50) {
  if (!scope.isFullTenantScope && scope.allowedSiteIds.length === 0) {
    return [];
  }

  return prisma.tank.findMany({
    where: {
      tenantId,
      ...(!scope.isFullTenantScope
        ? {
            siteId: {
              in: scope.allowedSiteIds,
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { tankName: { contains: search, mode: 'insensitive' } },
              { site: { siteCode: { contains: search, mode: 'insensitive' } } },
              { site: { siteName: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: 'desc' }],
    take: Math.min(Math.max(limit, 1), 100),
    select: {
      id: true,
      tankName: true,
      capacityL: true,
      reorderLevelL: true,
      site: {
        select: {
          id: true,
          siteCode: true,
          siteName: true,
        },
      },
    },
  });
}
