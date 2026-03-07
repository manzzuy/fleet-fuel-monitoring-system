import type { CreateFuelEntryRequest, FuelEntriesQuery, FuelEntryRecord } from '@fleet-fuel/shared';
import { Prisma } from '@prisma/client';
import type { DataScopeContext } from '../types/http';

import { prisma } from '../db/prisma';
import { AppError } from '../utils/errors';

function toDateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function mapFuelEntry(entry: {
  id: string;
  entryDate: Date;
  entryTime: string | null;
  odometerKm: number | null;
  liters: Prisma.Decimal;
  sourceType: 'CARD' | 'TANK' | 'STATION' | 'MANUAL' | 'APPROVED_SOURCE';
  approvedSourceContext: string | null;
  odometerFallbackUsed: boolean;
  odometerFallbackReason: string | null;
  notes: string | null;
  receiptUrl: string | null;
  createdAt: Date;
  vehicle: { id: string; fleetNumber: string; plateNumber: string | null };
  driver: { id: string; fullName: string } | null;
  site: { id: string; siteCode: string; siteName: string } | null;
}): FuelEntryRecord {
  return {
    id: entry.id,
    entry_date: entry.entryDate.toISOString().slice(0, 10),
    entry_time: entry.entryTime,
    odometer_km: entry.odometerKm,
    liters: entry.liters.toString(),
    source_type: entry.sourceType,
    approved_source_context: entry.approvedSourceContext,
    odometer_fallback_used: entry.odometerFallbackUsed,
    odometer_fallback_reason: entry.odometerFallbackReason,
    notes: entry.notes,
    receipt_url: entry.receiptUrl,
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
    created_at: entry.createdAt.toISOString(),
  };
}

export async function createFuelEntry(
  tenantId: string,
  actorUserId: string,
  payload: CreateFuelEntryRequest,
): Promise<{ entry: FuelEntryRecord; warnings: string[] }> {
  const vehicle = payload.vehicle_id
    ? await prisma.vehicle.findFirst({
        where: { id: payload.vehicle_id, tenantId },
        select: {
          id: true,
          siteId: true,
          fleetNumber: true,
        },
      })
    : await prisma.vehicle.findFirst({
        where: {
          tenantId,
          fleetNumber: payload.fleet_no!,
        },
        select: {
          id: true,
          siteId: true,
          fleetNumber: true,
        },
      });

  if (!vehicle) {
    throw new AppError(404, 'vehicle_not_found', 'Vehicle could not be found for this tenant.');
  }

  const [driver, site, fuelCard, tank] = await Promise.all([
    payload.driver_id
      ? prisma.user.findFirst({
          where: { id: payload.driver_id, tenantId },
          select: { id: true, fullName: true },
        })
      : Promise.resolve(null),
    payload.site_id
      ? prisma.site.findFirst({
          where: { id: payload.site_id, tenantId },
          select: { id: true },
        })
      : Promise.resolve(null),
    payload.fuel_card_id
      ? prisma.fuelCard.findFirst({
          where: { id: payload.fuel_card_id, tenantId },
          select: { id: true, assignedVehicleId: true },
        })
      : Promise.resolve(null),
    payload.tank_id
      ? prisma.tank.findFirst({
          where: { id: payload.tank_id, tenantId },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);

  if (payload.driver_id && !driver) {
    throw new AppError(404, 'driver_not_found', 'Driver could not be found for this tenant.');
  }

  if (payload.site_id && !site) {
    throw new AppError(404, 'site_not_found', 'Site could not be found for this tenant.');
  }

  if (payload.fuel_card_id && !fuelCard) {
    throw new AppError(404, 'fuel_card_not_found', 'Fuel card could not be found for this tenant.');
  }

  if (payload.tank_id && !tank) {
    throw new AppError(404, 'tank_not_found', 'Tank could not be found for this tenant.');
  }

  const warnings: string[] = [];
  if (fuelCard?.assignedVehicleId && fuelCard.assignedVehicleId !== vehicle.id) {
    warnings.push(`Fuel card is assigned to a different vehicle than ${vehicle.fleetNumber}.`);
  }

  const created = await prisma.fuelEntry.create({
    data: {
      tenantId,
      vehicleId: vehicle.id,
      driverId: driver?.id ?? null,
      siteId: payload.site_id ?? vehicle.siteId ?? null,
      entryDate: toDateOnly(payload.entry_date),
      entryTime: payload.entry_time ?? null,
      odometerKm: payload.odometer_km ?? null,
      liters: new Prisma.Decimal(payload.liters),
      sourceType: payload.source_type,
      approvedSourceContext: payload.approved_source_context ?? null,
      odometerFallbackUsed: payload.odometer_fallback_used ?? false,
      odometerFallbackReason: payload.odometer_fallback_reason ?? null,
      fuelCardId: payload.fuel_card_id ?? null,
      tankId: payload.tank_id ?? null,
      fuelStationId: payload.fuel_station_id ?? null,
      receiptUrl: payload.receipt_url ?? null,
      notes: payload.notes ?? null,
      createdBy: actorUserId,
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
    },
  });

  return {
    entry: mapFuelEntry(created),
    warnings,
  };
}

export async function listFuelEntries(
  tenantId: string,
  scope: DataScopeContext,
  query: FuelEntriesQuery,
): Promise<{ items: FuelEntryRecord[]; nextCursor: string | null }> {
  const siteScope: Prisma.FuelEntryWhereInput = scope.isFullTenantScope
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

  const where: Prisma.FuelEntryWhereInput = {
    tenantId,
    ...siteScope,
    ...(query.related_record_id ? { id: query.related_record_id } : {}),
    ...(query.vehicle_id ? { vehicleId: query.vehicle_id } : {}),
    ...(query.driver_id ? { driverId: query.driver_id } : {}),
    ...(query.site_id ? { siteId: query.site_id } : {}),
    ...(query.source_type ? { sourceType: query.source_type } : {}),
    ...(query.missing_receipt_only
      ? {
          receiptUrl: null,
        }
      : {}),
    ...(typeof query.fallback_used === 'boolean'
      ? {
          odometerFallbackUsed: query.fallback_used,
        }
      : {}),
    ...(query.from || query.to
      ? {
          entryDate: {
            ...(query.from ? { gte: toDateOnly(query.from) } : {}),
            ...(query.to ? { lte: toDateOnly(query.to) } : {}),
          },
        }
      : {}),
  };

  const rows = await prisma.fuelEntry.findMany({
    where,
    take: query.limit + 1,
    ...(query.cursor ? { skip: 1, cursor: { id: query.cursor } } : {}),
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: {
      vehicle: {
        select: { id: true, fleetNumber: true, plateNumber: true },
      },
      driver: {
        select: { id: true, fullName: true },
      },
      site: {
        select: { id: true, siteCode: true, siteName: true },
      },
    },
  });

  const hasMore = rows.length > query.limit;
  const pageItems = hasMore ? rows.slice(0, query.limit) : rows;

  return {
    items: pageItems.map(mapFuelEntry),
    nextCursor: hasMore ? pageItems.at(-1)?.id ?? null : null,
  };
}
