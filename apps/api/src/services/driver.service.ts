import type {
  CreateDriverDailyCheckRequest,
  CreateDriverFuelEntryRequest,
  DriverDashboardResponse,
  SubmitDailyCheckRequest,
} from '@fleet-fuel/shared';
import { randomUUID } from 'node:crypto';
import { UserRole } from '@prisma/client';

import { prisma } from '../db/prisma';
import { createDailyCheck, submitDailyCheck } from './daily-checklist.service';
import { createFuelEntry } from './fuel.service';
import { AppError } from '../utils/errors';

type DriverPrincipal = {
  id: string;
  fullName: string;
  employeeNo: string | null;
  username: string | null;
};

async function getDriverPrincipal(tenantId: string, userId: string): Promise<DriverPrincipal> {
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      tenantId,
      isActive: true,
      role: UserRole.DRIVER,
    },
    select: {
      id: true,
      fullName: true,
      employeeNo: true,
      username: true,
    },
  });

  if (!user) {
    throw new AppError(403, 'driver_not_authorized', 'Driver access is not available for this account.');
  }

  return user;
}

async function getDriverAssignment(tenantId: string, driver: DriverPrincipal) {
  const assignment = await prisma.driver.findFirst({
    where: {
      tenantId,
      OR: [
        ...(driver.employeeNo ? [{ employeeNumber: driver.employeeNo }] : []),
        ...(driver.username ? [{ username: driver.username }] : []),
      ],
    },
    select: {
      siteId: true,
      site: {
        select: {
          id: true,
          siteCode: true,
          siteName: true,
        },
      },
      assignedVehicle: {
        select: {
          id: true,
          fleetNumber: true,
          plateNumber: true,
        },
      },
    },
  });

  return assignment;
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function toDbDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

export async function getDriverDashboard(
  tenantId: string,
  userId: string,
  requestId: string,
): Promise<DriverDashboardResponse> {
  const driver = await getDriverPrincipal(tenantId, userId);
  const assignment = await getDriverAssignment(tenantId, driver);
  const date = todayDate();

  const [dailyCheck, fuelEntriesCount] = await Promise.all([
    assignment?.assignedVehicle
      ? prisma.dailyCheck.findFirst({
          where: {
            tenantId,
            vehicleId: assignment.assignedVehicle.id,
            checkDate: toDbDate(date),
            status: 'SUBMITTED',
          },
          select: { id: true },
        })
      : Promise.resolve(null),
    prisma.fuelEntry.count({
      where: {
        tenantId,
        driverId: driver.id,
        entryDate: toDbDate(date),
      },
    }),
  ]);

  return {
    driver: {
      id: driver.id,
      full_name: driver.fullName,
      employee_no: driver.employeeNo,
      username: driver.username,
    },
    assignment: {
      site: assignment?.site
        ? {
            id: assignment.site.id,
            site_code: assignment.site.siteCode,
            site_name: assignment.site.siteName,
          }
        : null,
      vehicle: assignment?.assignedVehicle
        ? {
            id: assignment.assignedVehicle.id,
            fleet_no: assignment.assignedVehicle.fleetNumber,
            plate_no: assignment.assignedVehicle.plateNumber,
          }
        : null,
    },
    today: {
      date,
      has_submitted_daily_check: Boolean(dailyCheck),
      fuel_entries_count: fuelEntriesCount,
    },
    request_id: requestId,
  };
}

export async function createDriverDailyCheckEntry(
  tenantId: string,
  userId: string,
  payload: CreateDriverDailyCheckRequest,
): Promise<{ id: string; status: 'DRAFT' | 'SUBMITTED' }> {
  const driver = await getDriverPrincipal(tenantId, userId);
  const assignment = await getDriverAssignment(tenantId, driver);
  const vehicleId = payload.vehicle_id ?? assignment?.assignedVehicle?.id;

  if (!vehicleId) {
    throw new AppError(400, 'vehicle_assignment_required', 'Driver has no assigned vehicle. Provide vehicle_id.');
  }

  const created = await createDailyCheck(tenantId, driver.id, {
    check_date: payload.check_date,
    vehicle_id: vehicleId,
    driver_id: driver.id,
    site_id: assignment?.site?.id,
  });

  await prisma.auditLog.create({
    data: {
      tenantId,
      actorId: driver.id,
      actorType: 'DRIVER',
      eventType: 'DRIVER_DAILY_CHECK_CREATED',
      metadata: {
        daily_check_id: created.id,
        status: created.status,
        check_date: payload.check_date,
        vehicle_id: vehicleId,
        odometer_km: typeof payload.odometer_km === 'number' ? payload.odometer_km : null,
        odometer_fallback_used: payload.odometer_fallback_used ?? false,
        odometer_fallback_reason: payload.odometer_fallback_reason ?? null,
      },
    },
  });

  return created;
}

export async function submitDriverDailyCheckEntry(
  tenantId: string,
  userId: string,
  dailyCheckId: string,
  payload: SubmitDailyCheckRequest,
): Promise<{ id: string; status: 'DRAFT' | 'SUBMITTED' }> {
  const driver = await getDriverPrincipal(tenantId, userId);
  const existing = await prisma.dailyCheck.findFirst({
    where: {
      id: dailyCheckId,
      tenantId,
      OR: [{ driverId: driver.id }, { createdBy: driver.id }],
    },
    select: { id: true },
  });

  if (!existing) {
    throw new AppError(404, 'daily_check_not_found', 'Daily check was not found for this driver.');
  }

  const updated = await submitDailyCheck(tenantId, existing.id, payload);

  await prisma.auditLog.create({
    data: {
      tenantId,
      actorId: driver.id,
      actorType: 'DRIVER',
      eventType: 'DRIVER_DAILY_CHECK_SUBMITTED',
      metadata: {
        daily_check_id: updated.id,
        status: updated.status,
        items_count: payload.items.length,
      },
    },
  });

  return updated;
}

function mapDriverSourceType(value: CreateDriverFuelEntryRequest['source_type']) {
  switch (value) {
    case 'card':
      return 'CARD' as const;
    case 'tank':
      return 'TANK' as const;
    case 'station':
      return 'STATION' as const;
    case 'approved_source':
      return 'APPROVED_SOURCE' as const;
    default:
      return 'MANUAL' as const;
  }
}

async function resolveFallbackOdometer(tenantId: string, vehicleId: string) {
  const latest = await prisma.fuelEntry.findFirst({
    where: {
      tenantId,
      vehicleId,
      odometerKm: { not: null },
    },
    orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
    select: {
      odometerKm: true,
    },
  });

  return latest?.odometerKm ?? null;
}

export async function createDriverFuelEntry(
  tenantId: string,
  userId: string,
  payload: CreateDriverFuelEntryRequest,
): Promise<{ entry: Awaited<ReturnType<typeof createFuelEntry>>['entry']; warnings: string[] }> {
  const driver = await getDriverPrincipal(tenantId, userId);
  const assignment = await getDriverAssignment(tenantId, driver);
  const vehicleId = payload.vehicle_id ?? assignment?.assignedVehicle?.id;

  if (!vehicleId) {
    throw new AppError(400, 'vehicle_assignment_required', 'Driver has no assigned vehicle. Provide vehicle_id.');
  }

  const fallbackOdometer =
    payload.odometer_fallback_used && typeof payload.odometer_km !== 'number'
      ? await resolveFallbackOdometer(tenantId, vehicleId)
      : null;

  const fallbackReason = payload.odometer_fallback_used ? payload.odometer_fallback_reason : undefined;
  const fallbackAuditNote =
    payload.odometer_fallback_used && fallbackReason
      ? `ODOMETER_FALLBACK: ${fallbackReason}`
      : undefined;

  const created = await createFuelEntry(tenantId, driver.id, {
    vehicle_id: vehicleId,
    entry_date: payload.entry_date,
    entry_time: payload.entry_time,
    driver_id: driver.id,
    site_id: assignment?.site?.id,
    odometer_km: payload.odometer_km ?? fallbackOdometer ?? undefined,
    odometer_fallback_used: payload.odometer_fallback_used,
    odometer_fallback_reason: fallbackReason,
    liters: payload.liters,
    source_type: mapDriverSourceType(payload.source_type),
    fuel_card_id: payload.fuel_card_id,
    tank_id: payload.tank_id,
    fuel_station_id: payload.fuel_station_id,
    approved_source_context: payload.approved_source_context,
    receipt_url: payload.receipt_url,
    notes: [payload.notes, fallbackAuditNote].filter(Boolean).join(' | ') || undefined,
  });

  await prisma.auditLog.create({
    data: {
      tenantId,
      actorId: driver.id,
      actorType: 'DRIVER',
      eventType: 'DRIVER_FUEL_ENTRY_SUBMITTED',
      metadata: {
        entry_id: created.entry.id,
        source_type: payload.source_type,
        odometer_fallback_used: payload.odometer_fallback_used,
        odometer_fallback_reason: payload.odometer_fallback_reason ?? null,
      },
    },
  });

  return created;
}

export async function storeDriverReceipt(
  tenantId: string,
  userId: string,
  originalName: string,
  mimeType: string,
  buffer: Buffer,
): Promise<{ receipt_url: string }> {
  if (!/^image\/(jpeg|png|webp)$/i.test(mimeType)) {
    throw new AppError(400, 'invalid_receipt_type', 'Receipt must be jpeg, png, or webp image.');
  }

  if (buffer.byteLength > 8 * 1024 * 1024) {
    throw new AppError(400, 'receipt_too_large', 'Receipt file exceeds 8MB.');
  }

  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_').toLowerCase();
  const extension = path.extname(safeName) || '.jpg';
  const receiptId = randomUUID();
  const relativePath = `storage/receipts/${tenantId}/${receiptId}${extension}`;
  const absolutePath = path.resolve(process.cwd(), relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, buffer);

  await prisma.auditLog.create({
    data: {
      tenantId,
      actorId: userId,
      actorType: 'DRIVER',
      eventType: 'DRIVER_RECEIPT_UPLOADED',
      metadata: {
        receipt_id: receiptId,
        mime_type: mimeType,
        bytes: buffer.byteLength,
      },
    },
  });

  return { receipt_url: `/${relativePath}` };
}
