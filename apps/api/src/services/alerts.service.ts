import type {
  DashboardAlertRecord,
  DashboardAlertType,
  DashboardAlertsQuery,
  DashboardAlertsResponse,
} from '@fleet-fuel/shared';
import { DailyCheckStatus, DailyCheckItemStatus, FuelSourceType, Prisma } from '@prisma/client';

import { prisma } from '../db/prisma';
import type { DataScopeContext, TenantContext } from '../types/http';
import {
  dispatchPendingNotifications,
  enqueueComplianceNotificationCandidates,
  type ComplianceNotificationCandidate,
} from './notification-dispatch.service';
import { logger } from '../utils/logger';

const HIGH_LITERS_THRESHOLD = new Prisma.Decimal(120);
const REPEAT_FUEL_WINDOW_MS = 2 * 60 * 60 * 1000;
const BASELINE_LOOKBACK_DAYS = 30;
const BASELINE_SAMPLE_SIZE = 5;
const MIN_DISTANCE_FOR_BASELINE_KM = 25;
const TOO_SOON_DISTANCE_KM = 30;
const DEVIATION_ALERT_THRESHOLD_PCT = 35;
const HIGH_LITERS_MULTIPLIER = 1.4;
const HIGH_RISK_SCORE_THRESHOLD = 60;
const MORNING_CHECKLIST_CUTOFF_HOUR = Number(process.env.ALERT_MORNING_CHECKLIST_CUTOFF_HOUR ?? '9');
const DRIVER_FREQUENT_SKIP_THRESHOLD = 3;
const REPEATED_CHECKLIST_ISSUE_THRESHOLD = 2;
const COMPLIANCE_EXPIRY_WINDOW_DAYS = 30;
const HIGH_RISK_WEIGHTS = {
  missingReceipt: 20,
  fallbackUsed: 15,
  approvedSource: 15,
  abnormalDeviation: 30,
  tooSoon: 20,
} as const;

function toDateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function formatDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function qs(
  values: Record<
    string,
    string | number | boolean | null | undefined
  >,
) {
  const params = new URLSearchParams();
  for (const [key, raw] of Object.entries(values)) {
    if (raw === null || raw === undefined || raw === '') {
      continue;
    }
    params.set(key, String(raw));
  }
  return params.toString();
}

function makeAlertId(type: DashboardAlertType, recordId: string) {
  return `${type}:${recordId}`;
}

function asDecimal(value: Prisma.Decimal) {
  return new Prisma.Decimal(value);
}

function describeTooSoon(diffMs: number, distanceKm: number | null) {
  const minutes = Math.max(1, Math.floor(diffMs / 60000));
  if (distanceKm === null) {
    return `fueling repeated in ${minutes} minutes`;
  }

  return `fueling repeated in ${minutes} minutes across ${distanceKm} km`;
}

function formatPercent(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function toNumber(value: Prisma.Decimal) {
  return Number(value.toString());
}

type BaselinePoint = {
  liters: number;
  distanceKm: number;
};

function buildBaselinePoints(
  rows: Array<{
    liters: Prisma.Decimal;
    odometerKm: number | null;
  }>,
): BaselinePoint[] {
  const points: BaselinePoint[] = [];

  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    if (!previous || !current) {
      continue;
    }

    if (previous.odometerKm === null || current.odometerKm === null) {
      continue;
    }

    const distanceKm = current.odometerKm - previous.odometerKm;
    if (distanceKm < MIN_DISTANCE_FOR_BASELINE_KM) {
      continue;
    }

    points.push({
      liters: toNumber(current.liters),
      distanceKm,
    });
  }

  return points.slice(-BASELINE_SAMPLE_SIZE);
}

function calculateBaselineLitersPer100Km(points: BaselinePoint[]): number | null {
  if (points.length < 3) {
    return null;
  }

  const totalDistance = points.reduce((sum, point) => sum + point.distanceKm, 0);
  if (totalDistance <= 0) {
    return null;
  }

  const totalLiters = points.reduce((sum, point) => sum + point.liters, 0);
  return (totalLiters / totalDistance) * 100;
}

function buildScopedSiteFilter(scope: DataScopeContext) {
  if (scope.isFullTenantScope) {
    return undefined;
  }

  return {
    in: scope.allowedSiteIds,
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

export async function getTenantDashboardAlerts(
  tenant: TenantContext,
  scope: DataScopeContext,
  query: DashboardAlertsQuery,
  requestId: string,
): Promise<DashboardAlertsResponse> {
  const date = query.date ?? formatDateOnly(new Date());
  const dateStart = toDateOnly(date);
  const dateEnd = new Date(dateStart);
  dateEnd.setUTCDate(dateEnd.getUTCDate() + 1);
  const lookbackStart = new Date(dateStart);
  lookbackStart.setUTCDate(lookbackStart.getUTCDate() - BASELINE_LOOKBACK_DAYS);
  const checklistWindowStart = new Date(dateStart);
  checklistWindowStart.setUTCDate(checklistWindowStart.getUTCDate() - 6);

  const now = new Date();
  const nowDate = toDateOnly(formatDateOnly(now));
  const complianceWindowEnd = new Date(nowDate);
  complianceWindowEnd.setUTCDate(complianceWindowEnd.getUTCDate() + COMPLIANCE_EXPIRY_WINDOW_DAYS);
  const todayIso = formatDateOnly(now);
  const cutoffPassed =
    date < todayIso || (date === todayIso && now.getHours() >= MORNING_CHECKLIST_CUTOFF_HOUR);

  const siteScopeFilter = buildScopedSiteFilter(scope);
  const dailyCheckScope = buildDailyCheckScope(scope);
  const fuelEntryScope = buildFuelEntryScope(scope);

  const [
    activeVehicles,
    submittedChecks,
    checksWithIssues,
    repeatedVehicleIssuesRows,
    frequentSkipperRows,
    complianceRows,
    fuelEntriesToday,
    fuelEntriesLookback,
  ] =
    await Promise.all([
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
          fleetNumber: true,
          plateNumber: true,
          site: {
            select: {
              id: true,
              siteCode: true,
              siteName: true,
            },
          },
        },
      }),
      prisma.dailyCheck.findMany({
        where: {
          tenantId: tenant.id,
          ...dailyCheckScope,
          status: DailyCheckStatus.SUBMITTED,
          checkDate: {
            gte: dateStart,
            lt: dateEnd,
          },
        },
        select: {
          vehicleId: true,
        },
      }),
      prisma.dailyCheck.findMany({
        where: {
          tenantId: tenant.id,
          ...dailyCheckScope,
          status: DailyCheckStatus.SUBMITTED,
          checkDate: {
            gte: dateStart,
            lt: dateEnd,
          },
          items: {
            some: {
              status: DailyCheckItemStatus.NOT_OK,
            },
          },
        },
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
          site: {
            select: {
              id: true,
              siteCode: true,
              siteName: true,
            },
          },
          items: {
            where: {
              status: DailyCheckItemStatus.NOT_OK,
            },
            select: {
              itemCode: true,
              item: {
                select: {
                  requiredItem: true,
                },
              },
            },
          },
        },
      }),
      prisma.dailyCheck.groupBy({
        by: ['vehicleId'],
        where: {
          tenantId: tenant.id,
          ...dailyCheckScope,
          checkDate: {
            gte: checklistWindowStart,
            lte: dateStart,
          },
          status: DailyCheckStatus.SUBMITTED,
          items: {
            some: {
              status: DailyCheckItemStatus.NOT_OK,
            },
          },
        },
        _count: {
          _all: true,
        },
      }),
      prisma.dailyCheck.groupBy({
        by: ['driverId'],
        where: {
          tenantId: tenant.id,
          ...dailyCheckScope,
          driverId: { not: null },
          checkDate: {
            gte: checklistWindowStart,
            lte: dateStart,
          },
          status: DailyCheckStatus.DRAFT,
        },
        _count: {
          _all: true,
        },
      }),
      prisma.complianceRecord.findMany({
        where: {
          tenantId: tenant.id,
          expiryDate: {
            not: null,
            lte: complianceWindowEnd,
          },
          ...(scope.isFullTenantScope
            ? {}
            : {
                OR: [
                  {
                    appliesTo: 'VEHICLE',
                    targetVehicle: {
                      siteId: {
                        in: scope.allowedSiteIds,
                      },
                    },
                  },
                  {
                    appliesTo: 'DRIVER',
                    targetUser: {
                      OR: [
                        {
                          siteAssignments: {
                            some: {
                              siteId: {
                                in: scope.allowedSiteIds,
                              },
                            },
                          },
                        },
                        {
                          supervisedSites: {
                            some: {
                              siteId: {
                                in: scope.allowedSiteIds,
                              },
                            },
                          },
                        },
                        {
                          dailyChecksAsDriver: {
                            some: {
                              siteId: {
                                in: scope.allowedSiteIds,
                              },
                            },
                          },
                        },
                        {
                          fuelEntriesAsDriver: {
                            some: {
                              siteId: {
                                in: scope.allowedSiteIds,
                              },
                            },
                          },
                        },
                      ],
                    },
                  },
                ],
              }),
        },
        include: {
          complianceType: {
            select: {
              name: true,
            },
          },
          targetUser: {
            select: {
              id: true,
              fullName: true,
              siteAssignments: {
                select: {
                  site: {
                    select: {
                      id: true,
                      siteCode: true,
                      siteName: true,
                    },
                  },
                },
                take: 1,
              },
            },
          },
          targetVehicle: {
            select: {
              id: true,
              fleetNumber: true,
              plateNumber: true,
              site: {
                select: {
                  id: true,
                  siteCode: true,
                  siteName: true,
                },
              },
            },
          },
        },
      }),
      prisma.fuelEntry.findMany({
        where: {
          tenantId: tenant.id,
          ...fuelEntryScope,
          entryDate: {
            gte: dateStart,
            lt: dateEnd,
          },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
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
          site: {
            select: {
              id: true,
              siteCode: true,
              siteName: true,
            },
          },
        },
      }),
      prisma.fuelEntry.findMany({
        where: {
          tenantId: tenant.id,
          ...fuelEntryScope,
          entryDate: {
            gte: lookbackStart,
            lt: dateEnd,
          },
        },
        orderBy: [{ vehicleId: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          vehicleId: true,
          liters: true,
          odometerKm: true,
          createdAt: true,
          entryDate: true,
        },
      }),
    ]);

  const alerts: DashboardAlertRecord[] = [];
  const submittedVehicleIds = new Set(submittedChecks.map((check) => check.vehicleId));
  const repeatedVehicleIssueMap = new Map(
    repeatedVehicleIssuesRows.map((row) => [row.vehicleId, row._count._all]),
  );
  const frequentSkipperMap = new Map(
    frequentSkipperRows
      .filter((row) => row.driverId)
      .map((row) => [row.driverId as string, row._count._all]),
  );

  for (const compliance of complianceRows) {
    const expiryDate = compliance.expiryDate ? toDateOnly(formatDateOnly(compliance.expiryDate)) : null;
    if (!expiryDate) {
      continue;
    }
    const isExpired = expiryDate.getTime() < nowDate.getTime();

    alerts.push({
      id: makeAlertId(isExpired ? 'compliance_expired' : 'compliance_expiring_soon', compliance.id),
      alert_type: isExpired ? 'compliance_expired' : 'compliance_expiring_soon',
      severity: isExpired ? 'HIGH' : 'MEDIUM',
      occurred_at: compliance.createdAt.toISOString(),
      vehicle: compliance.targetVehicle
        ? {
            id: compliance.targetVehicle.id,
            fleet_no: compliance.targetVehicle.fleetNumber,
            plate_no: compliance.targetVehicle.plateNumber,
          }
        : null,
      driver: compliance.targetUser
        ? {
            id: compliance.targetUser.id,
            full_name: compliance.targetUser.fullName,
          }
        : null,
      site: (() => {
        const site = compliance.targetVehicle?.site ?? compliance.targetUser?.siteAssignments[0]?.site ?? null;
        if (!site) {
          return null;
        }
        return {
          id: site.id,
          site_code: site.siteCode,
          site_name: site.siteName,
        };
      })(),
      reason: isExpired
        ? `Needs review: ${compliance.complianceType.name} is expired (${formatDateOnly(expiryDate)}).`
        : `Needs review: ${compliance.complianceType.name} expires on ${formatDateOnly(expiryDate)}.`,
      related_record_id: compliance.id,
      action: {
        label: compliance.appliesTo === 'DRIVER' ? 'Review driver compliance' : 'Review vehicle compliance',
        target:
          compliance.appliesTo === 'DRIVER'
            ? `/drivers?compliance_record_id=${compliance.id}`
            : `/vehicles?compliance_record_id=${compliance.id}`,
      },
    });
  }

  if (cutoffPassed) {
    for (const vehicle of activeVehicles) {
      if (submittedVehicleIds.has(vehicle.id)) {
        continue;
      }

      alerts.push({
        id: makeAlertId('missing_daily_check', vehicle.id),
        alert_type: 'missing_daily_check',
        severity: 'HIGH',
        occurred_at: new Date(`${date}T23:59:00.000Z`).toISOString(),
        vehicle: {
          id: vehicle.id,
          fleet_no: vehicle.fleetNumber,
          plate_no: vehicle.plateNumber,
        },
        driver: null,
        site: vehicle.site
          ? {
              id: vehicle.site.id,
              site_code: vehicle.site.siteCode,
              site_name: vehicle.site.siteName,
            }
          : null,
        reason: `Vehicle ${vehicle.fleetNumber} has no submitted daily check for ${date} after cutoff ${String(
          MORNING_CHECKLIST_CUTOFF_HOUR,
        ).padStart(2, '0')}:00.`,
        related_record_id: vehicle.id,
        action: {
          label: 'Review missing check',
          target: `/daily-checks?${qs({
            date,
            vehicle_id: vehicle.id,
            site_id: vehicle.site?.id,
            skip_only: true,
          })}`,
        },
      });
    }
  }

  for (const check of checksWithIssues) {
    const criticalNotOkCount = check.items.filter((item) => item.item.requiredItem).length;
    const repeatedIssueCount = repeatedVehicleIssueMap.get(check.vehicle.id) ?? 0;

    if (criticalNotOkCount > 0) {
      alerts.push({
        id: makeAlertId('critical_checklist_issue', check.id),
        alert_type: 'critical_checklist_issue',
        severity: 'HIGH',
        occurred_at: check.createdAt.toISOString(),
        vehicle: {
          id: check.vehicle.id,
          fleet_no: check.vehicle.fleetNumber,
          plate_no: check.vehicle.plateNumber,
        },
        driver: check.driver
          ? {
              id: check.driver.id,
              full_name: check.driver.fullName,
            }
          : null,
        site: check.site
          ? {
              id: check.site.id,
              site_code: check.site.siteCode,
              site_name: check.site.siteName,
            }
          : null,
        reason: `${criticalNotOkCount} critical checklist item(s) marked NOT OK.`,
        related_record_id: check.id,
        action: {
          label: 'Open daily check',
          target: `/daily-checks/${check.id}?${qs({
            date,
            vehicle_id: check.vehicle.id,
            driver_id: check.driver?.id,
            site_id: check.site?.id,
            critical_only: true,
            issue_only: true,
          })}`,
        },
      });
    }

    alerts.push({
      id: makeAlertId('checklist_issue_reported', check.id),
      alert_type: 'checklist_issue_reported',
      severity: criticalNotOkCount > 0 ? 'HIGH' : 'MEDIUM',
      occurred_at: check.createdAt.toISOString(),
      vehicle: {
        id: check.vehicle.id,
        fleet_no: check.vehicle.fleetNumber,
        plate_no: check.vehicle.plateNumber,
      },
      driver: check.driver
        ? {
            id: check.driver.id,
            full_name: check.driver.fullName,
          }
        : null,
      site: check.site
        ? {
            id: check.site.id,
            site_code: check.site.siteCode,
            site_name: check.site.siteName,
          }
        : null,
      reason: `${check.items.length} checklist item(s) marked NOT OK.`,
      related_record_id: check.id,
      action: {
        label: 'Open daily check',
        target: `/daily-checks/${check.id}?${qs({
          date,
          vehicle_id: check.vehicle.id,
          driver_id: check.driver?.id,
          site_id: check.site?.id,
          issue_only: true,
        })}`,
      },
    });

    if (repeatedIssueCount >= REPEATED_CHECKLIST_ISSUE_THRESHOLD) {
      alerts.push({
        id: makeAlertId('repeated_checklist_issues_vehicle', check.id),
        alert_type: 'repeated_checklist_issues_vehicle',
        severity: 'MEDIUM',
        occurred_at: check.createdAt.toISOString(),
        vehicle: {
          id: check.vehicle.id,
          fleet_no: check.vehicle.fleetNumber,
          plate_no: check.vehicle.plateNumber,
        },
        driver: check.driver
          ? {
              id: check.driver.id,
              full_name: check.driver.fullName,
            }
          : null,
        site: check.site
          ? {
              id: check.site.id,
              site_code: check.site.siteCode,
              site_name: check.site.siteName,
            }
          : null,
        reason: `Vehicle has ${repeatedIssueCount} checklist issue day(s) in the last 7 days.`,
        related_record_id: check.id,
        action: {
          label: 'Review issue history',
          target: `/daily-checks?${qs({
            from: formatDateOnly(checklistWindowStart),
            to: date,
            vehicle_id: check.vehicle.id,
            site_id: check.site?.id,
            issue_only: true,
            repeated_vehicle_only: true,
          })}`,
        },
      });
    }
  }

  if (cutoffPassed) {
    const frequentSkippers = await prisma.user.findMany({
      where: {
        tenantId: tenant.id,
        id: {
          in: [...frequentSkipperMap.entries()]
            .filter(([, count]) => count >= DRIVER_FREQUENT_SKIP_THRESHOLD)
            .map(([driverId]) => driverId),
        },
      },
      select: {
        id: true,
        fullName: true,
      },
    });

    for (const driver of frequentSkippers) {
      const skipCount = frequentSkipperMap.get(driver.id) ?? 0;
      alerts.push({
        id: makeAlertId('driver_frequent_skips', driver.id),
        alert_type: 'driver_frequent_skips',
        severity: 'MEDIUM',
        occurred_at: new Date(`${date}T23:58:00.000Z`).toISOString(),
        vehicle: null,
        driver: {
          id: driver.id,
          full_name: driver.fullName,
        },
        site: null,
        reason: `Driver has ${skipCount} draft/unsubmitted checks in the last 7 days.`,
        related_record_id: driver.id,
        action: {
          label: 'Review driver checks',
          target: `/daily-checks?${qs({
            from: formatDateOnly(checklistWindowStart),
            to: date,
            driver_id: driver.id,
            skip_only: true,
          })}`,
        },
      });
    }
  }

  for (const entry of fuelEntriesToday) {
    if (
      (entry.sourceType === FuelSourceType.CARD ||
        entry.sourceType === FuelSourceType.STATION ||
        entry.sourceType === FuelSourceType.APPROVED_SOURCE) &&
      !entry.receiptUrl
    ) {
      alerts.push({
        id: makeAlertId('fuel_missing_receipt', entry.id),
        alert_type: 'fuel_missing_receipt',
        severity: 'MEDIUM',
        occurred_at: entry.createdAt.toISOString(),
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
        site: entry.site
          ? {
              id: entry.site.id,
              site_code: entry.site.siteCode,
              site_name: entry.site.siteName,
            }
          : null,
        reason: 'Fuel entry is missing a receipt URL for a source that expects receipt evidence.',
        related_record_id: entry.id,
        action: {
          label: 'Open fuel logs',
          target: `/fuel?${qs({
            from: date,
            to: date,
            vehicle_id: entry.vehicle.id,
            driver_id: entry.driver?.id,
            site_id: entry.site?.id,
            source_type: entry.sourceType,
            missing_receipt_only: true,
            related_record_id: entry.id,
          })}`,
        },
      });
    }

    if (entry.odometerFallbackUsed) {
      alerts.push({
        id: makeAlertId('fuel_used_odometer_fallback', entry.id),
        alert_type: 'fuel_used_odometer_fallback',
        severity: 'MEDIUM',
        occurred_at: entry.createdAt.toISOString(),
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
        site: entry.site
          ? {
              id: entry.site.id,
              site_code: entry.site.siteCode,
              site_name: entry.site.siteName,
            }
          : null,
        reason: entry.odometerFallbackReason
          ? `Odometer fallback used: ${entry.odometerFallbackReason}`
          : 'Odometer fallback was used without a captured odometer value.',
        related_record_id: entry.id,
        action: {
          label: 'Review fuel entry',
          target: `/fuel?${qs({
            from: date,
            to: date,
            vehicle_id: entry.vehicle.id,
            driver_id: entry.driver?.id,
            site_id: entry.site?.id,
            fallback_used: true,
            related_record_id: entry.id,
          })}`,
        },
      });
    }

    if (entry.sourceType === FuelSourceType.APPROVED_SOURCE) {
      alerts.push({
        id: makeAlertId('fuel_used_approved_source', entry.id),
        alert_type: 'fuel_used_approved_source',
        severity: 'MEDIUM',
        occurred_at: entry.createdAt.toISOString(),
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
        site: entry.site
          ? {
              id: entry.site.id,
              site_code: entry.site.siteCode,
              site_name: entry.site.siteName,
            }
          : null,
        reason: entry.approvedSourceContext
          ? `Approved source used with context: ${entry.approvedSourceContext}`
          : 'Approved source used.',
        related_record_id: entry.id,
        action: {
          label: 'Review approved source use',
          target: `/fuel?${qs({
            from: date,
            to: date,
            vehicle_id: entry.vehicle.id,
            driver_id: entry.driver?.id,
            site_id: entry.site?.id,
            source_type: 'APPROVED_SOURCE',
            related_record_id: entry.id,
          })}`,
        },
      });
    }

    if (asDecimal(entry.liters).gt(HIGH_LITERS_THRESHOLD)) {
      alerts.push({
        id: makeAlertId('suspicious_high_liters', entry.id),
        alert_type: 'suspicious_high_liters',
        severity: 'HIGH',
        occurred_at: entry.createdAt.toISOString(),
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
        site: entry.site
          ? {
              id: entry.site.id,
              site_code: entry.site.siteCode,
              site_name: entry.site.siteName,
            }
          : null,
        reason: `Fuel liters (${entry.liters.toString()}) exceed threshold (${HIGH_LITERS_THRESHOLD.toString()}).`,
        related_record_id: entry.id,
        action: {
          label: 'Inspect fuel volume',
          target: `/fuel?${qs({
            from: date,
            to: date,
            vehicle_id: entry.vehicle.id,
            driver_id: entry.driver?.id,
            site_id: entry.site?.id,
            related_record_id: entry.id,
          })}`,
        },
      });
    }
  }

  const lookbackByVehicle = new Map<
    string,
    Array<{
      id: string;
      liters: Prisma.Decimal;
      odometerKm: number | null;
      createdAt: Date;
      entryDate: Date;
    }>
  >();

  for (const item of fuelEntriesLookback) {
    const rows = lookbackByVehicle.get(item.vehicleId) ?? [];
    rows.push(item);
    lookbackByVehicle.set(item.vehicleId, rows);
  }

  for (const entry of fuelEntriesToday) {
    const candidateSeries = lookbackByVehicle.get(entry.vehicleId) ?? [];
    const historyUntilCurrent = candidateSeries.filter((item) => item.createdAt.getTime() <= entry.createdAt.getTime());
    if (historyUntilCurrent.length < 2) {
      continue;
    }

    const previous = historyUntilCurrent.at(-2);
    const current = historyUntilCurrent.at(-1);
    if (!previous || !current) {
      continue;
    }

    const diffMs = current.createdAt.getTime() - previous.createdAt.getTime();
    const distanceKm =
      previous.odometerKm !== null && current.odometerKm !== null
        ? Math.max(0, current.odometerKm - previous.odometerKm)
        : null;
    const currentLiters = toNumber(current.liters);
    const tooSoonByTime = diffMs <= REPEAT_FUEL_WINDOW_MS;
    const tooSoonByDistance = distanceKm !== null && distanceKm <= TOO_SOON_DISTANCE_KM;
    const tooSoon = tooSoonByTime || tooSoonByDistance;

    if (tooSoon) {
      alerts.push({
        id: makeAlertId('fueling_too_soon_after_previous_fill', current.id),
        alert_type: 'fueling_too_soon_after_previous_fill',
        severity: 'HIGH',
        occurred_at: current.createdAt.toISOString(),
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
        site: entry.site
          ? {
              id: entry.site.id,
              site_code: entry.site.siteCode,
              site_name: entry.site.siteName,
            }
          : null,
        reason: `Needs review: fueling too soon after previous fill (${describeTooSoon(diffMs, distanceKm)}).`,
        related_record_id: current.id,
        anomaly_details: {
          previous_odometer_km: previous.odometerKm,
          current_odometer_km: current.odometerKm,
          distance_km: distanceKm,
          actual_liters: currentLiters,
        },
        action: {
          label: 'Review too-soon fueling',
          target: `/fuel?${qs({
            from: date,
            to: date,
            vehicle_id: entry.vehicle.id,
            driver_id: entry.driver?.id,
            site_id: entry.site?.id,
            related_record_id: current.id,
          })}`,
        },
      });
    }

    const baselinePoints = buildBaselinePoints(historyUntilCurrent.slice(0, -1));
    const baselineLitersPer100Km = calculateBaselineLitersPer100Km(baselinePoints);
    let deviationPercent: number | null = null;
    let expectedLiters: number | null = null;

    if (
      baselineLitersPer100Km !== null &&
      baselineLitersPer100Km > 0 &&
      distanceKm !== null &&
      distanceKm >= MIN_DISTANCE_FOR_BASELINE_KM
    ) {
      expectedLiters = (baselineLitersPer100Km * distanceKm) / 100;
      if (expectedLiters > 0) {
        deviationPercent = ((currentLiters - expectedLiters) / expectedLiters) * 100;
      }
    }

    const highLitersVsDistance =
      expectedLiters !== null && expectedLiters > 0 && currentLiters >= expectedLiters * HIGH_LITERS_MULTIPLIER;
    const expectedKmPerL = baselineLitersPer100Km && baselineLitersPer100Km > 0 ? 100 / baselineLitersPer100Km : null;
    if (highLitersVsDistance && expectedLiters !== null) {
      alerts.push({
        id: makeAlertId('suspicious_high_liters_vs_distance', current.id),
        alert_type: 'suspicious_high_liters_vs_distance',
        severity: currentLiters >= expectedLiters * 1.8 ? 'HIGH' : 'MEDIUM',
        occurred_at: current.createdAt.toISOString(),
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
        site: entry.site
          ? {
              id: entry.site.id,
              site_code: entry.site.siteCode,
              site_name: entry.site.siteName,
            }
          : null,
        reason: `Needs review: actual liters ${currentLiters.toFixed(1)}L are higher than expected ${expectedLiters.toFixed(
          1,
        )}L for ${distanceKm ?? 0} km.`,
        related_record_id: current.id,
        anomaly_details: {
          previous_odometer_km: previous.odometerKm,
          current_odometer_km: current.odometerKm,
          distance_km: distanceKm,
          expected_km_per_l: expectedKmPerL,
          expected_liters: expectedLiters,
          actual_liters: currentLiters,
          deviation_pct: deviationPercent,
        },
        action: {
          label: 'Review high liters vs distance',
          target: `/fuel?${qs({
            from: formatDateOnly(lookbackStart),
            to: date,
            vehicle_id: entry.vehicle.id,
            driver_id: entry.driver?.id,
            site_id: entry.site?.id,
            related_record_id: current.id,
          })}`,
        },
      });
    }

    const abnormalDeviation =
      deviationPercent !== null && Math.abs(deviationPercent) >= DEVIATION_ALERT_THRESHOLD_PCT;
    if (abnormalDeviation && expectedLiters !== null) {
      alerts.push({
        id: makeAlertId('suspicious_consumption_deviation', current.id),
        alert_type: 'suspicious_consumption_deviation',
        severity: Math.abs(deviationPercent!) >= 60 ? 'HIGH' : 'MEDIUM',
        occurred_at: current.createdAt.toISOString(),
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
        site: entry.site
          ? {
              id: entry.site.id,
              site_code: entry.site.siteCode,
              site_name: entry.site.siteName,
            }
          : null,
        reason: `Needs review: consumption deviation ${formatPercent(
          deviationPercent!,
        )}. Actual ${currentLiters.toFixed(1)}L vs expected ${expectedLiters.toFixed(
          1,
        )}L from baseline ${(baselineLitersPer100Km ?? 0).toFixed(2)} L/100km over ${distanceKm} km.`,
        related_record_id: current.id,
        anomaly_details: {
          previous_odometer_km: previous.odometerKm,
          current_odometer_km: current.odometerKm,
          distance_km: distanceKm,
          expected_km_per_l: expectedKmPerL,
          expected_liters: expectedLiters,
          actual_liters: currentLiters,
          deviation_pct: deviationPercent,
        },
        action: {
          label: 'Review consumption',
          target: `/fuel?${qs({
            from: formatDateOnly(lookbackStart),
            to: date,
            vehicle_id: entry.vehicle.id,
            driver_id: entry.driver?.id,
            site_id: entry.site?.id,
            related_record_id: current.id,
          })}`,
        },
      });
    }

    const missingReceipt =
      (entry.sourceType === FuelSourceType.CARD ||
        entry.sourceType === FuelSourceType.STATION ||
        entry.sourceType === FuelSourceType.APPROVED_SOURCE) &&
      !entry.receiptUrl;
    const approvedSource = entry.sourceType === FuelSourceType.APPROVED_SOURCE;
    const fallbackUsed = entry.odometerFallbackUsed;
    const riskScore =
      (missingReceipt ? HIGH_RISK_WEIGHTS.missingReceipt : 0) +
      (fallbackUsed ? HIGH_RISK_WEIGHTS.fallbackUsed : 0) +
      (approvedSource ? HIGH_RISK_WEIGHTS.approvedSource : 0) +
      (abnormalDeviation ? HIGH_RISK_WEIGHTS.abnormalDeviation : 0) +
      (tooSoon ? HIGH_RISK_WEIGHTS.tooSoon : 0);

    if (riskScore >= HIGH_RISK_SCORE_THRESHOLD) {
      const factors = [
        missingReceipt ? 'missing receipt' : null,
        fallbackUsed ? 'odometer fallback used' : null,
        approvedSource ? 'approved source used' : null,
        abnormalDeviation ? `deviation ${formatPercent(deviationPercent ?? 0)}` : null,
        tooSoon ? describeTooSoon(diffMs, distanceKm) : null,
      ].filter(Boolean);

      alerts.push({
        id: makeAlertId('suspicious_high_risk_combination', current.id),
        alert_type: 'suspicious_high_risk_combination',
        severity: riskScore >= 80 ? 'HIGH' : 'MEDIUM',
        occurred_at: current.createdAt.toISOString(),
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
        site: entry.site
          ? {
              id: entry.site.id,
              site_code: entry.site.siteCode,
              site_name: entry.site.siteName,
            }
          : null,
        reason: `Needs review: high-risk fuel combination score ${riskScore}/100 (${factors.join(', ')}).`,
        related_record_id: current.id,
        anomaly_details: {
          previous_odometer_km: previous.odometerKm,
          current_odometer_km: current.odometerKm,
          distance_km: distanceKm,
          expected_km_per_l: baselineLitersPer100Km && baselineLitersPer100Km > 0 ? 100 / baselineLitersPer100Km : null,
          expected_liters: expectedLiters,
          actual_liters: currentLiters,
          deviation_pct: deviationPercent,
          risk_score: riskScore,
        },
        action: {
          label: 'Review high-risk fuel event',
          target: `/fuel?${qs({
            from: formatDateOnly(lookbackStart),
            to: date,
            vehicle_id: entry.vehicle.id,
            driver_id: entry.driver?.id,
            site_id: entry.site?.id,
            related_record_id: current.id,
          })}`,
        },
      });
    }
  }

  const sortedAlerts = alerts.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));

  const filteredItems = sortedAlerts.filter((alert) => {
    if (query.severity && alert.severity !== query.severity) {
      return false;
    }
    if (query.alert_type && alert.alert_type !== query.alert_type) {
      return false;
    }
    if (query.vehicle_id && alert.vehicle?.id !== query.vehicle_id) {
      return false;
    }
    if (query.driver_id && alert.driver?.id !== query.driver_id) {
      return false;
    }
    if (query.site_id && alert.site?.id !== query.site_id) {
      return false;
    }
    return true;
  });

  const notificationCandidates: ComplianceNotificationCandidate[] = sortedAlerts
    .filter(
      (
        alert,
      ): alert is DashboardAlertRecord & {
        alert_type: 'compliance_expired' | 'compliance_expiring_soon';
        related_record_id: string;
      } =>
        (alert.alert_type === 'compliance_expired' || alert.alert_type === 'compliance_expiring_soon') &&
        Boolean(alert.related_record_id),
    )
    .map((alert) => ({
      alert_type: alert.alert_type,
      related_record_id: alert.related_record_id,
      occurred_at: alert.occurred_at,
      reason: alert.reason,
      severity: alert.severity,
      action_target: alert.action?.target,
      site_id: alert.site?.id ?? null,
    }));

  if (notificationCandidates.length > 0) {
    try {
      await enqueueComplianceNotificationCandidates(tenant.id, notificationCandidates);
      await dispatchPendingNotifications({ tenantId: tenant.id, limit: 50 });
    } catch (error) {
      logger.error(
        {
          err: error,
          tenant_id: tenant.id,
          request_id: requestId,
        },
        'compliance_notification_pipeline_failed',
      );
    }
  }

  return {
    tenant: {
      id: tenant.id,
      subdomain: tenant.subdomain,
    },
    summary: {
      date,
      vehicles_missing_daily_check: sortedAlerts.filter((item) => item.alert_type === 'missing_daily_check').length,
      checklist_issues_today: sortedAlerts.filter((item) =>
        [
          'checklist_issue_reported',
          'critical_checklist_issue',
          'repeated_checklist_issues_vehicle',
          'driver_frequent_skips',
        ].includes(item.alert_type),
      ).length,
      fuel_entries_today: fuelEntriesToday.length,
      high_priority_exceptions: sortedAlerts.filter((item) => item.severity === 'HIGH').length,
      total_alerts: sortedAlerts.length,
    },
    items: filteredItems,
    scope_status: scope.scopeStatus,
    request_id: requestId,
  };
}
