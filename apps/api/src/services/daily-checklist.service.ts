import type {
  ChecklistMasterResponse,
  CreateDailyCheckRequest,
  DailyCheckDetailsResponse,
  DailyChecksListResponse,
  DailyChecksQuery,
  SubmitDailyCheckRequest,
} from '@fleet-fuel/shared';
import { DailyCheckStatus, Prisma } from '@prisma/client';

import { prisma } from '../db/prisma';
import type { DataScopeContext } from '../types/http';
import { recordOutOfScopeAuditLog } from './scope-utils.service';
import { AppError } from '../utils/errors';

function toDateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function formatDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

export async function getChecklistMaster(requestId: string): Promise<ChecklistMasterResponse> {
  const sections = await prisma.checklistSectionMaster.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { sectionCode: 'asc' }],
    include: {
      items: {
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { itemCode: 'asc' }],
      },
    },
  });

  return {
    sections: sections.map((section) => ({
      section_code: section.sectionCode,
      section_name: section.sectionName,
      sort_order: section.sortOrder,
      items: section.items.map((item) => ({
        item_code: item.itemCode,
        item_name: item.itemName,
        sort_order: item.sortOrder,
        required: item.requiredItem,
      })),
    })),
    request_id: requestId,
  };
}

export async function createDailyCheck(
  tenantId: string,
  actorUserId: string,
  payload: CreateDailyCheckRequest,
): Promise<{ id: string; status: DailyCheckStatus }> {
  const [vehicle, driver, site] = await Promise.all([
    prisma.vehicle.findFirst({
      where: { id: payload.vehicle_id, tenantId },
      select: { id: true, siteId: true },
    }),
    payload.driver_id
      ? prisma.user.findFirst({
          where: { id: payload.driver_id, tenantId },
          select: { id: true },
        })
      : Promise.resolve(null),
    payload.site_id
      ? prisma.site.findFirst({
          where: { id: payload.site_id, tenantId },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);

  if (!vehicle) {
    throw new AppError(404, 'vehicle_not_found', 'Vehicle could not be found for this tenant.');
  }

  if (payload.driver_id && !driver) {
    throw new AppError(404, 'driver_not_found', 'Driver could not be found for this tenant.');
  }

  if (payload.site_id && !site) {
    throw new AppError(404, 'site_not_found', 'Site could not be found for this tenant.');
  }

  const dailyCheck = await prisma.dailyCheck.upsert({
    where: {
      tenantId_vehicleId_checkDate: {
        tenantId,
        vehicleId: vehicle.id,
        checkDate: toDateOnly(payload.check_date),
      },
    },
    create: {
      tenantId,
      vehicleId: vehicle.id,
      driverId: driver?.id ?? null,
      siteId: payload.site_id ?? vehicle.siteId ?? null,
      checkDate: toDateOnly(payload.check_date),
      createdBy: actorUserId,
      status: DailyCheckStatus.DRAFT,
    },
    update: {
      ...(payload.driver_id ? { driverId: driver!.id } : {}),
      ...(payload.site_id ? { siteId: payload.site_id } : {}),
    },
    select: {
      id: true,
      status: true,
    },
  });

  return dailyCheck;
}

export async function submitDailyCheck(
  tenantId: string,
  dailyCheckId: string,
  payload: SubmitDailyCheckRequest,
): Promise<{ id: string; status: DailyCheckStatus }> {
  const [dailyCheck, validItems] = await Promise.all([
    prisma.dailyCheck.findFirst({
      where: { id: dailyCheckId, tenantId },
      select: { id: true },
    }),
    prisma.checklistItemMaster.findMany({
      where: {
        itemCode: { in: payload.items.map((item) => item.item_code) },
      },
      select: { itemCode: true },
    }),
  ]);

  if (!dailyCheck) {
    throw new AppError(404, 'daily_check_not_found', 'Daily check could not be found for this tenant.');
  }

  const knownCodes = new Set(validItems.map((item) => item.itemCode));
  const unknown = payload.items.find((item) => !knownCodes.has(item.item_code));
  if (unknown) {
    throw new AppError(400, 'invalid_checklist_item', `Unknown checklist item code: ${unknown.item_code}.`);
  }

  const result = await prisma.$transaction(async (tx) => {
    for (const item of payload.items) {
      await tx.dailyCheckItem.upsert({
        where: {
          dailyCheckId_itemCode: {
            dailyCheckId: dailyCheck.id,
            itemCode: item.item_code,
          },
        },
        update: {
          status: item.status,
          notes: item.notes ?? null,
          photoUrl: item.photo_url ?? null,
        },
        create: {
          dailyCheckId: dailyCheck.id,
          itemCode: item.item_code,
          status: item.status,
          notes: item.notes ?? null,
          photoUrl: item.photo_url ?? null,
        },
      });
    }

    return tx.dailyCheck.update({
      where: { id: dailyCheck.id },
      data: { status: DailyCheckStatus.SUBMITTED },
      select: {
        id: true,
        status: true,
      },
    });
  });

  return result;
}

export async function listDailyChecks(
  tenantId: string,
  scope: DataScopeContext,
  query: DailyChecksQuery,
  requestId: string,
): Promise<DailyChecksListResponse> {
  const anchorDate = query.date ?? query.to ?? query.from ?? formatDateOnly(new Date());
  const anchorStart = toDateOnly(anchorDate);
  const windowStart = new Date(anchorStart);
  windowStart.setUTCDate(windowStart.getUTCDate() - 6);

  const siteScope: Prisma.DailyCheckWhereInput = scope.isFullTenantScope
    ? {}
    : {
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

  const where: Prisma.DailyCheckWhereInput = {
    tenantId,
    ...siteScope,
    ...(query.related_record_id ? { id: query.related_record_id } : {}),
    ...(query.vehicle_id ? { vehicleId: query.vehicle_id } : {}),
    ...(query.driver_id ? { driverId: query.driver_id } : {}),
    ...(query.site_id ? { siteId: query.site_id } : {}),
    ...(query.skip_only ? { status: DailyCheckStatus.DRAFT } : query.status ? { status: query.status } : {}),
    ...(query.issue_only
      ? {
          items: {
            some: {
              status: 'NOT_OK',
            },
          },
        }
      : {}),
    ...(query.critical_only
      ? {
          items: {
            some: {
              status: 'NOT_OK',
              item: {
                requiredItem: true,
              },
            },
          },
        }
      : {}),
    ...(query.date
      ? { checkDate: toDateOnly(query.date) }
      : query.from || query.to
        ? {
            checkDate: {
              ...(query.from ? { gte: toDateOnly(query.from) } : {}),
              ...(query.to ? { lte: toDateOnly(query.to) } : {}),
            },
          }
        : {}),
  };

  const [rows, repeatedVehicleRows, driverDraftRows] = await Promise.all([
    prisma.dailyCheck.findMany({
      where,
      orderBy: [{ checkDate: 'desc' }, { createdAt: 'desc' }],
      include: {
        vehicle: { select: { id: true, fleetNumber: true, plateNumber: true } },
        site: { select: { id: true, siteCode: true, siteName: true } },
        driver: { select: { id: true, fullName: true } },
        items: {
          select: {
            status: true,
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
          tenantId,
          ...siteScope,
          checkDate: {
          gte: windowStart,
          lte: anchorStart,
        },
        items: {
          some: {
            status: 'NOT_OK',
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
          tenantId,
          ...siteScope,
          driverId: { not: null },
        checkDate: {
          gte: windowStart,
          lte: anchorStart,
        },
        status: 'DRAFT',
      },
      _count: {
        _all: true,
      },
    }),
  ]);

  const repeatedVehicleMap = new Map(repeatedVehicleRows.map((row) => [row.vehicleId, row._count._all]));
  const driverDraftMap = new Map(
    driverDraftRows
      .filter((row) => row.driverId)
      .map((row) => [row.driverId as string, row._count._all]),
  );

  const filteredRows = query.repeated_vehicle_only
    ? rows.filter((row) => (repeatedVehicleMap.get(row.vehicleId) ?? 0) >= 2)
    : rows;

  return {
    items: filteredRows.map((row) => {
      const okCount = row.items.filter((item) => item.status === 'OK').length;
      const notOkCount = row.items.filter((item) => item.status === 'NOT_OK').length;
      const naCount = row.items.filter((item) => item.status === 'NA').length;
      const criticalNotOkCount = row.items.filter(
        (item) => item.status === 'NOT_OK' && item.item.requiredItem,
      ).length;
      const repeatedIssueCount = repeatedVehicleMap.get(row.vehicleId) ?? 0;
      const driverDraftCount = row.driverId ? driverDraftMap.get(row.driverId) ?? 0 : 0;

      return {
        id: row.id,
        check_date: formatDateOnly(row.checkDate),
        status: row.status,
        vehicle: {
          id: row.vehicle.id,
          fleet_no: row.vehicle.fleetNumber,
          plate_no: row.vehicle.plateNumber,
        },
        site: row.site
          ? {
              id: row.site.id,
              site_code: row.site.siteCode,
              site_name: row.site.siteName,
            }
          : null,
        driver: row.driver
          ? {
              id: row.driver.id,
              full_name: row.driver.fullName,
            }
          : null,
        stats: {
          ok_count: okCount,
          not_ok_count: notOkCount,
          na_count: naCount,
          total_items: row.items.length,
        },
        signals: {
          critical_not_ok_count: criticalNotOkCount,
          repeated_issue_count_7d: repeatedIssueCount,
          vehicle_has_repeated_issues: repeatedIssueCount >= 2,
          driver_draft_count_7d: driverDraftCount,
        },
        created_at: row.createdAt.toISOString(),
      };
    }),
    request_id: requestId,
  };
}

export async function getDailyCheckDetails(
  tenantId: string,
  scope: DataScopeContext,
  actorUserId: string,
  dailyCheckId: string,
  requestId: string,
): Promise<DailyCheckDetailsResponse> {
  const siteScope: Prisma.DailyCheckWhereInput = scope.isFullTenantScope
    ? {}
    : {
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

  const row = await prisma.dailyCheck.findFirst({
    where: {
      id: dailyCheckId,
      tenantId,
      ...siteScope,
    },
    include: {
      vehicle: { select: { id: true, fleetNumber: true, plateNumber: true } },
      site: { select: { id: true, siteCode: true, siteName: true } },
      driver: { select: { id: true, fullName: true } },
      items: {
        select: {
          itemCode: true,
          status: true,
          notes: true,
          photoUrl: true,
        },
        orderBy: { itemCode: 'asc' },
      },
    },
  });

  if (!row) {
    const existsInTenant = await prisma.dailyCheck.findFirst({
      where: {
        id: dailyCheckId,
        tenantId,
      },
      select: {
        id: true,
      },
    });

    if (existsInTenant && !scope.isFullTenantScope) {
      await recordOutOfScopeAuditLog({
        tenantId,
        actorId: actorUserId,
        route: '/tenanted/daily-checks/:id',
        resourceType: 'daily_check',
        resourceId: dailyCheckId,
      });
    }

    throw new AppError(404, 'daily_check_not_found', 'Daily check could not be found for this tenant.');
  }

  return {
    id: row.id,
    check_date: formatDateOnly(row.checkDate),
    status: row.status,
    vehicle: {
      id: row.vehicle.id,
      fleet_no: row.vehicle.fleetNumber,
      plate_no: row.vehicle.plateNumber,
    },
    site: row.site
      ? {
          id: row.site.id,
          site_code: row.site.siteCode,
          site_name: row.site.siteName,
        }
      : null,
    driver: row.driver
      ? {
          id: row.driver.id,
          full_name: row.driver.fullName,
        }
      : null,
    items: row.items.map((item) => ({
      item_code: item.itemCode,
      status: item.status,
      notes: item.notes,
      photo_url: item.photoUrl,
    })),
    request_id: requestId,
  };
}
