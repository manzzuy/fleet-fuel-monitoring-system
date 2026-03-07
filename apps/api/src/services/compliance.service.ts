import type {
  ComplianceRecordItem,
  ComplianceRecordsQuery,
  ComplianceTypeRecord,
  CreateComplianceRecordRequest,
  CreateComplianceTypeRequest,
  UpdateComplianceTypeRequest,
} from '@fleet-fuel/shared';
import { Prisma, UserRole } from '@prisma/client';

import { prisma } from '../db/prisma';
import type { DataScopeContext } from '../types/http';
import { AppError } from '../utils/errors';
import { recordOutOfScopeAuditLog } from './scope-utils.service';

const DEFAULT_EXPIRY_WINDOW_DAYS = 30;

function formatDateOnly(value: Date | null) {
  if (!value) {
    return null;
  }
  return value.toISOString().slice(0, 10);
}

function toDateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function todayDateOnly() {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return today;
}

function driverScopeWhere(scope: DataScopeContext): Prisma.UserWhereInput {
  if (scope.isFullTenantScope) {
    return {};
  }

  if (scope.allowedSiteIds.length === 0) {
    return {
      id: {
        in: [],
      },
    };
  }

  return {
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
}

function vehicleScopeWhere(scope: DataScopeContext): Prisma.VehicleWhereInput {
  if (scope.isFullTenantScope) {
    return {};
  }

  return {
    siteId: {
      in: scope.allowedSiteIds,
    },
  };
}

function mapType(row: {
  id: string;
  name: string;
  appliesTo: 'DRIVER' | 'VEHICLE';
  requiresExpiry: boolean;
  isActive: boolean;
  createdAt: Date;
}): ComplianceTypeRecord {
  return {
    id: row.id,
    name: row.name,
    applies_to: row.appliesTo,
    requires_expiry: row.requiresExpiry,
    is_active: row.isActive,
    created_at: row.createdAt.toISOString(),
  };
}

function mapRecord(
  row: {
    id: string;
    appliesTo: 'DRIVER' | 'VEHICLE';
    targetUserId: string | null;
    targetVehicleId: string | null;
    referenceNumber: string | null;
    issuedAt: Date | null;
    expiryDate: Date | null;
    notes: string | null;
    evidenceUrl: string | null;
    createdAt: Date;
    complianceType: {
      id: string;
      name: string;
    };
    targetUser: {
      fullName: string;
      employeeNo: string | null;
    } | null;
    targetVehicle: {
      fleetNumber: string;
      plateNumber: string | null;
    } | null;
  },
  expiringWithinDays = DEFAULT_EXPIRY_WINDOW_DAYS,
): ComplianceRecordItem {
  const today = todayDateOnly();
  const expiryDate = row.expiryDate ? toDateOnly(row.expiryDate.toISOString().slice(0, 10)) : null;
  const expiryWindowEnd = new Date(today);
  expiryWindowEnd.setUTCDate(expiryWindowEnd.getUTCDate() + expiringWithinDays);
  const isExpired = expiryDate !== null && expiryDate.getTime() < today.getTime();
  const isExpiringSoon =
    expiryDate !== null && expiryDate.getTime() >= today.getTime() && expiryDate.getTime() <= expiryWindowEnd.getTime();

  const targetLabel =
    row.appliesTo === 'DRIVER'
      ? `${row.targetUser?.fullName ?? 'Unknown driver'}${row.targetUser?.employeeNo ? ` (${row.targetUser.employeeNo})` : ''}`
      : `${row.targetVehicle?.fleetNumber ?? 'Unknown vehicle'}${row.targetVehicle?.plateNumber ? ` (${row.targetVehicle.plateNumber})` : ''}`;

  return {
    id: row.id,
    applies_to: row.appliesTo,
    target_id: row.appliesTo === 'DRIVER' ? (row.targetUserId ?? '') : (row.targetVehicleId ?? ''),
    target_label: targetLabel,
    type: {
      id: row.complianceType.id,
      name: row.complianceType.name,
    },
    reference_number: row.referenceNumber,
    issued_at: formatDateOnly(row.issuedAt),
    expiry_date: formatDateOnly(row.expiryDate),
    is_expired: isExpired,
    is_expiring_soon: isExpiringSoon,
    notes: row.notes,
    evidence_url: row.evidenceUrl,
    created_at: row.createdAt.toISOString(),
  };
}

export async function listComplianceTypes(
  tenantId: string,
  appliesTo?: 'DRIVER' | 'VEHICLE',
): Promise<ComplianceTypeRecord[]> {
  const rows = await prisma.complianceType.findMany({
    where: {
      tenantId,
      ...(appliesTo ? { appliesTo } : {}),
    },
    orderBy: [{ appliesTo: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      appliesTo: true,
      requiresExpiry: true,
      isActive: true,
      createdAt: true,
    },
  });

  return rows.map(mapType);
}

export async function createComplianceType(
  tenantId: string,
  payload: CreateComplianceTypeRequest,
): Promise<ComplianceTypeRecord> {
  try {
    const created = await prisma.complianceType.create({
      data: {
        tenantId,
        name: payload.name,
        appliesTo: payload.applies_to,
        requiresExpiry: payload.requires_expiry,
      },
      select: {
        id: true,
        name: true,
        appliesTo: true,
        requiresExpiry: true,
        isActive: true,
        createdAt: true,
      },
    });
    return mapType(created);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError(409, 'compliance_type_conflict', 'A compliance type with this name already exists.');
    }
    throw error;
  }
}

export async function updateComplianceType(
  tenantId: string,
  typeId: string,
  payload: UpdateComplianceTypeRequest,
): Promise<ComplianceTypeRecord> {
  const existing = await prisma.complianceType.findFirst({
    where: {
      id: typeId,
      tenantId,
    },
    select: {
      id: true,
    },
  });

  if (!existing) {
    throw new AppError(404, 'compliance_type_not_found', 'Compliance type not found.');
  }

  const updated = await prisma.complianceType.update({
    where: {
      id: existing.id,
    },
    data: {
      ...(payload.name ? { name: payload.name } : {}),
      ...(typeof payload.requires_expiry === 'boolean' ? { requiresExpiry: payload.requires_expiry } : {}),
      ...(typeof payload.is_active === 'boolean' ? { isActive: payload.is_active } : {}),
    },
    select: {
      id: true,
      name: true,
      appliesTo: true,
      requiresExpiry: true,
      isActive: true,
      createdAt: true,
    },
  });

  return mapType(updated);
}

export async function listComplianceRecords(
  tenantId: string,
  scope: DataScopeContext,
  query: ComplianceRecordsQuery,
): Promise<ComplianceRecordItem[]> {
  if (!scope.isFullTenantScope && scope.allowedSiteIds.length === 0) {
    return [];
  }

  const expiringWithinDays = query.expiring_within_days ?? DEFAULT_EXPIRY_WINDOW_DAYS;
  const today = todayDateOnly();
  const expiryWindowEnd = new Date(today);
  expiryWindowEnd.setUTCDate(expiryWindowEnd.getUTCDate() + expiringWithinDays);

  const rows = await prisma.complianceRecord.findMany({
    where: {
      tenantId,
      ...(query.applies_to ? { appliesTo: query.applies_to } : {}),
      ...(query.driver_id
        ? {
            targetUserId: query.driver_id,
          }
        : {}),
      ...(query.vehicle_id
        ? {
            targetVehicleId: query.vehicle_id,
          }
        : {}),
      ...(query.expiring_within_days
        ? {
            expiryDate: {
              gte: today,
              lte: expiryWindowEnd,
            },
          }
        : {}),
      ...(scope.isFullTenantScope
        ? {}
        : {
            OR: [
              {
                appliesTo: 'VEHICLE',
                targetVehicle: vehicleScopeWhere(scope),
              },
              {
                appliesTo: 'DRIVER',
                targetUser: driverScopeWhere(scope),
              },
            ],
          }),
    },
    orderBy: [{ expiryDate: 'asc' }, { createdAt: 'desc' }],
    include: {
      complianceType: {
        select: {
          id: true,
          name: true,
        },
      },
      targetUser: {
        select: {
          fullName: true,
          employeeNo: true,
        },
      },
      targetVehicle: {
        select: {
          fleetNumber: true,
          plateNumber: true,
        },
      },
    },
  });

  return rows.map((row) => mapRecord(row, expiringWithinDays));
}

export async function createComplianceRecord(args: {
  tenantId: string;
  actorId: string;
  scope: DataScopeContext;
  payload: CreateComplianceRecordRequest;
  route: string;
}): Promise<ComplianceRecordItem> {
  const { tenantId, actorId, scope, payload, route } = args;

  const type = await prisma.complianceType.findFirst({
    where: {
      id: payload.compliance_type_id,
      tenantId,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      appliesTo: true,
      requiresExpiry: true,
    },
  });

  if (!type) {
    throw new AppError(404, 'compliance_type_not_found', 'Compliance type not found or inactive.');
  }

  if (type.appliesTo !== payload.applies_to) {
    throw new AppError(400, 'compliance_target_mismatch', 'Compliance type target does not match applies_to.');
  }

  if (type.requiresExpiry && !payload.expiry_date) {
    throw new AppError(400, 'compliance_expiry_required', 'expiry_date is required for this compliance type.');
  }

  if (!scope.isFullTenantScope && scope.allowedSiteIds.length === 0) {
    await recordOutOfScopeAuditLog({
      tenantId,
      actorId,
      route,
      resourceType: payload.applies_to === 'DRIVER' ? 'driver' : 'vehicle',
      resourceId: payload.target_id,
    });
    throw new AppError(403, 'scope_access_denied', 'No site scope is assigned for this account.');
  }

  if (payload.applies_to === 'DRIVER') {
    const targetUser = await prisma.user.findFirst({
      where: {
        id: payload.target_id,
        tenantId,
        role: { in: [UserRole.DRIVER, UserRole.SITE_SUPERVISOR] },
        ...(scope.isFullTenantScope ? {} : driverScopeWhere(scope)),
      },
      select: { id: true },
    });

    if (!targetUser) {
      await recordOutOfScopeAuditLog({
        tenantId,
        actorId,
        route,
        resourceType: 'driver',
        resourceId: payload.target_id,
      });
      throw new AppError(404, 'driver_not_found', 'Driver not found in accessible scope.');
    }
  } else {
    const targetVehicle = await prisma.vehicle.findFirst({
      where: {
        id: payload.target_id,
        tenantId,
        ...(scope.isFullTenantScope ? {} : vehicleScopeWhere(scope)),
      },
      select: { id: true },
    });

    if (!targetVehicle) {
      await recordOutOfScopeAuditLog({
        tenantId,
        actorId,
        route,
        resourceType: 'vehicle',
        resourceId: payload.target_id,
      });
      throw new AppError(404, 'vehicle_not_found', 'Vehicle not found in accessible scope.');
    }
  }

  const created = await prisma.complianceRecord.create({
    data: {
      tenantId,
      complianceTypeId: type.id,
      appliesTo: payload.applies_to,
      targetUserId: payload.applies_to === 'DRIVER' ? payload.target_id : null,
      targetVehicleId: payload.applies_to === 'VEHICLE' ? payload.target_id : null,
      referenceNumber: payload.reference_number ?? null,
      issuedAt: payload.issued_at ? toDateOnly(payload.issued_at) : null,
      expiryDate: payload.expiry_date ? toDateOnly(payload.expiry_date) : null,
      notes: payload.notes ?? null,
      evidenceUrl: payload.evidence_url ?? null,
      createdBy: actorId,
    },
    include: {
      complianceType: {
        select: {
          id: true,
          name: true,
        },
      },
      targetUser: {
        select: {
          fullName: true,
          employeeNo: true,
        },
      },
      targetVehicle: {
        select: {
          fleetNumber: true,
          plateNumber: true,
        },
      },
    },
  });

  return mapRecord(created);
}
