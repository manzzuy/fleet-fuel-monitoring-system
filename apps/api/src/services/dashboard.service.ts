import type {
  DashboardDailyChecksToday,
  DashboardLastBatch,
  DashboardMonitoringSummary,
  DashboardOnboardingCounts,
  DashboardRecentDriver,
  DashboardRecentFuelEntry,
  DashboardRecentVehicle,
  TenantDashboardSummaryResponse,
} from '@fleet-fuel/shared';
import { OnboardingImportBatchStatus, Prisma, UserRole } from '@prisma/client';

import { prisma } from '../db/prisma';
import { getTenantDashboardAlerts } from './alerts.service';
import type { DataScopeContext, TenantContext } from '../types/http';

const RECENT_LIMIT = 8;
const HIGH_RISK_FUEL_ALERT_TYPES = new Set([
  'suspicious_consumption_deviation',
  'suspicious_high_liters',
  'suspicious_high_liters_vs_distance',
  'suspicious_repeat_fuel',
  'fueling_too_soon_after_previous_fill',
  'suspicious_high_risk_combination',
]);

function emptyBatchCounts(): DashboardOnboardingCounts {
  return {
    sites: 0,
    drivers: 0,
    vehicles: 0,
    fuel_cards: 0,
    tanks: 0,
    equipment: 0,
  };
}

function extractBatchCounts(previewJson: unknown): DashboardOnboardingCounts {
  const normalized = (previewJson as { normalized?: Record<string, unknown> } | null)?.normalized;
  if (!normalized || typeof normalized !== 'object') {
    return emptyBatchCounts();
  }

  const toCount = (key: string) => {
    const value = normalized[key];
    return Array.isArray(value) ? value.length : 0;
  };

  return {
    sites: toCount('Sites'),
    drivers: toCount('Drivers'),
    vehicles: toCount('Vehicles_Cards'),
    fuel_cards: toCount('Vehicles_Cards'),
    tanks: toCount('Tanks'),
    equipment: toCount('Equipment'),
  };
}

function mapLastBatch(batch: {
  id: string;
  status: OnboardingImportBatchStatus;
  createdAt: Date;
  previewJson: unknown;
} | null): DashboardLastBatch | null {
  if (!batch) {
    return null;
  }

  return {
    id: batch.id,
    status: batch.status,
    created_at: batch.createdAt.toISOString(),
    committed_at: batch.status === 'COMMITTED' ? batch.createdAt.toISOString() : null,
    counts: extractBatchCounts(batch.previewJson),
  };
}

function buildDailyCheckScope(scope: DataScopeContext): Prisma.DailyCheckWhereInput {
  if (scope.isFullTenantScope) {
    return {};
  }

  return {
    OR: [
      {
        siteId: {
          in: scope.allowedSiteIds,
        },
      },
      {
        siteId: null,
        vehicle: {
          siteId: {
            in: scope.allowedSiteIds,
          },
        },
      },
    ],
  };
}

function buildFuelEntryScope(scope: DataScopeContext): Prisma.FuelEntryWhereInput {
  if (scope.isFullTenantScope) {
    return {};
  }

  return {
    OR: [
      {
        siteId: {
          in: scope.allowedSiteIds,
        },
      },
      {
        siteId: null,
        vehicle: {
          siteId: {
            in: scope.allowedSiteIds,
          },
        },
      },
    ],
  };
}

export async function getTenantDashboardSummary(
  tenant: TenantContext,
  scope: DataScopeContext,
  requestId: string,
): Promise<TenantDashboardSummaryResponse> {
  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setUTCDate(endOfToday.getUTCDate() + 1);

  const siteScopeFilter = scope.isFullTenantScope
    ? undefined
    : {
        in: scope.allowedSiteIds,
      };
  const dailyCheckScope = buildDailyCheckScope(scope);
  const fuelEntryScope = buildFuelEntryScope(scope);
  const driverScope = scope.isFullTenantScope
    ? undefined
    : {
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
      };

  const [
    sitesTotal,
    vehiclesTotal,
    fuelCardsTotal,
    tanksTotal,
    driversTotal,
    recentVehicles,
    recentDrivers,
    recentFuelEntries,
    dailyChecksSubmittedToday,
    dailyChecksPendingToday,
    activeVehiclesForMissingChecks,
    submittedVehiclesToday,
    lastBatch,
  ] = await Promise.all([
      prisma.site.count({
        where: {
          tenantId: tenant.id,
          ...(siteScopeFilter
            ? {
                id: siteScopeFilter,
              }
            : {}),
        },
      }),
      prisma.vehicle.count({
        where: {
          tenantId: tenant.id,
          ...(siteScopeFilter
            ? {
                siteId: siteScopeFilter,
              }
            : {}),
        },
      }),
      prisma.fuelCard.count({
        where: {
          tenantId: tenant.id,
          ...(siteScopeFilter
            ? {
                assignedVehicle: {
                  siteId: siteScopeFilter,
                },
              }
            : {}),
        },
      }),
      prisma.tank.count({
        where: {
          tenantId: tenant.id,
          ...(siteScopeFilter
            ? {
                siteId: siteScopeFilter,
              }
            : {}),
        },
      }),
      prisma.user.count({
        where: {
          tenantId: tenant.id,
          role: {
            in: [UserRole.DRIVER, UserRole.SITE_SUPERVISOR],
          },
          ...(driverScope ?? {}),
        },
      }),
      prisma.vehicle.findMany({
        where: {
          tenantId: tenant.id,
          ...(siteScopeFilter
            ? {
                siteId: siteScopeFilter,
              }
            : {}),
        },
        take: RECENT_LIMIT,
        orderBy: { createdAt: 'desc' },
        include: {
          site: {
            select: {
              siteCode: true,
            },
          },
        },
      }),
      prisma.user.findMany({
        where: {
          tenantId: tenant.id,
          role: {
            in: [UserRole.DRIVER, UserRole.SITE_SUPERVISOR],
          },
          ...(driverScope ?? {}),
        },
        take: RECENT_LIMIT,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.fuelEntry.findMany({
        where: {
          tenantId: tenant.id,
          ...fuelEntryScope,
        },
        take: 10,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: {
          vehicle: {
            select: {
              id: true,
              fleetNumber: true,
              plateNumber: true,
            },
          },
          driver: {
            select: {
              id: true,
              fullName: true,
            },
          },
        },
      }),
      prisma.dailyCheck.count({
        where: {
          tenantId: tenant.id,
          ...dailyCheckScope,
          checkDate: {
            gte: startOfToday,
            lt: endOfToday,
          },
          status: 'SUBMITTED',
        },
      }),
      prisma.dailyCheck.count({
        where: {
          tenantId: tenant.id,
          ...dailyCheckScope,
          checkDate: {
            gte: startOfToday,
            lt: endOfToday,
          },
          status: 'DRAFT',
        },
      }),
      prisma.vehicle.findMany({
        where: {
          tenantId: tenant.id,
          isActive: true,
          ...(siteScopeFilter
            ? {
                siteId: siteScopeFilter,
              }
            : {}),
        },
        select: {
          id: true,
        },
      }),
      prisma.dailyCheck.findMany({
        where: {
          tenantId: tenant.id,
          ...dailyCheckScope,
          checkDate: {
            gte: startOfToday,
            lt: endOfToday,
          },
          status: 'SUBMITTED',
        },
        select: {
          vehicleId: true,
        },
        distinct: ['vehicleId'],
      }),
      prisma.onboardingImportBatch.findFirst({
        where: { tenantId: tenant.id },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          createdAt: true,
          previewJson: true,
        },
      }),
    ]);

  const submittedVehicleIds = new Set(
    submittedVehiclesToday
      .map((row) => row.vehicleId)
      .filter((value): value is string => Boolean(value)),
  );
  const vehiclesMissingDailyCheckToday = activeVehiclesForMissingChecks.filter(
    (vehicle) => !submittedVehicleIds.has(vehicle.id),
  ).length;

  const vehicles: DashboardRecentVehicle[] = recentVehicles.map((vehicle) => ({
    id: vehicle.id,
    fleet_number: vehicle.fleetNumber,
    plate_number: vehicle.plateNumber,
    vehicle_type: vehicle.vehicleType,
    site_code: vehicle.site?.siteCode ?? null,
    created_at: vehicle.createdAt.toISOString(),
  }));

  const drivers: DashboardRecentDriver[] = recentDrivers.map((driver) => ({
    id: driver.id,
    employee_no: driver.employeeNo,
    username: driver.username,
    full_name: driver.fullName,
    role: driver.role as 'DRIVER' | 'SITE_SUPERVISOR',
    created_at: driver.createdAt.toISOString(),
  }));

  const fuelEntries: DashboardRecentFuelEntry[] = recentFuelEntries.map((entry) => ({
    id: entry.id,
    entry_date: entry.entryDate.toISOString().slice(0, 10),
    entry_time: entry.entryTime,
    liters: entry.liters.toString(),
    odometer_km: entry.odometerKm,
    source_type: entry.sourceType,
    vehicle: {
      id: entry.vehicle.id,
      fleet_no: entry.vehicle.fleetNumber,
      plate_no: entry.vehicle.plateNumber,
    },
    driver: entry.driver
      ? {
          id: entry.driver.id,
          full_name: entry.driver.fullName,
        }
      : null,
    created_at: entry.createdAt.toISOString(),
  }));

  const dailyChecksToday: DashboardDailyChecksToday = {
    submitted_count: dailyChecksSubmittedToday,
    pending_count: dailyChecksPendingToday,
  };

  const todayDate = startOfToday.toISOString().slice(0, 10);
  const alertsSummary = await getTenantDashboardAlerts(
    tenant,
    scope,
    {
      date: todayDate,
    },
    requestId,
  );

  const monitoringSummary: DashboardMonitoringSummary = {
    vehicles_missing_daily_check: vehiclesMissingDailyCheckToday,
    high_risk_fuel_alerts: alertsSummary.items.filter((item) => HIGH_RISK_FUEL_ALERT_TYPES.has(item.alert_type)).length,
    compliance_expired: alertsSummary.items.filter((item) => item.alert_type === 'compliance_expired').length,
    compliance_expiring_soon: alertsSummary.items.filter((item) => item.alert_type === 'compliance_expiring_soon').length,
    receipt_gaps: alertsSummary.items.filter((item) => item.alert_type === 'fuel_missing_receipt').length,
    checklist_issues_today: alertsSummary.summary.checklist_issues_today,
    fuel_entries_today: alertsSummary.summary.fuel_entries_today,
    fuel_missing_receipt: alertsSummary.items.filter((item) => item.alert_type === 'fuel_missing_receipt').length,
    fuel_odometer_fallback: alertsSummary.items.filter((item) => item.alert_type === 'fuel_used_odometer_fallback').length,
    approved_source_usage: alertsSummary.items.filter((item) => item.alert_type === 'fuel_used_approved_source').length,
    high_priority_exceptions: alertsSummary.summary.high_priority_exceptions,
    total_alerts: alertsSummary.summary.total_alerts,
  };

  const urgentExceptions = alertsSummary.items.filter((item) => item.severity === 'HIGH').slice(0, 6);

  return {
    tenant: {
      id: tenant.id,
      subdomain: tenant.subdomain,
    },
    kpis: {
      vehicles_total: vehiclesTotal,
      drivers_total: driversTotal,
      fuel_cards_total: fuelCardsTotal,
      sites_total: sitesTotal,
      tanks_total: tanksTotal,
    },
    onboarding: {
      last_batch: mapLastBatch(lastBatch),
    },
    daily_checks_today: dailyChecksToday,
    monitoring_summary: monitoringSummary,
    urgent_exceptions: urgentExceptions,
    fuel_entries_recent: fuelEntries,
    recent: {
      vehicles,
      drivers,
      fuel_entries: fuelEntries,
      alerts: alertsSummary.items.slice(0, 16),
    },
    scope_status: scope.scopeStatus,
    request_id: requestId,
  };
}
