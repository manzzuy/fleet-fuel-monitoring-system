import { randomBytes, randomUUID } from 'node:crypto';

import { Prisma, UserRole } from '@prisma/client';

import { prisma } from '../db/prisma';
import type { AuthContext, DataScopeContext } from '../types/http';
import { AppError } from '../utils/errors';
import { hashPassword } from '../utils/password';
import { recordOutOfScopeAuditLog } from './scope-utils.service';

function canManageMasterData(role: AuthContext['role']) {
  return (
    role === 'TENANT_ADMIN' ||
    role === 'TRANSPORT_MANAGER' ||
    role === 'COMPANY_ADMIN' ||
    role === 'HEAD_OFFICE_ADMIN'
  );
}

function canAssignRole(actorRole: AuthContext['role'], targetRole: UserRole) {
  if (actorRole === 'TRANSPORT_MANAGER') {
    return targetRole !== UserRole.TRANSPORT_MANAGER;
  }
  if (actorRole === 'TENANT_ADMIN' || actorRole === 'COMPANY_ADMIN' || actorRole === 'HEAD_OFFICE_ADMIN') {
    return targetRole === UserRole.DRIVER || targetRole === UserRole.SITE_SUPERVISOR || targetRole === UserRole.SAFETY_OFFICER;
  }
  return false;
}

function generateTemporaryPassword() {
  const suffix = randomBytes(9).toString('base64url');
  return `Tmp${suffix}9aA`;
}

export function ensureCanManageMasterData(auth: AuthContext, scope: DataScopeContext) {
  if (!canManageMasterData(auth.role)) {
    throw new AppError(403, 'forbidden_master_data_write', 'Your role cannot modify operational master data.');
  }

  if (!scope.isFullTenantScope) {
    throw new AppError(403, 'forbidden_master_data_write', 'Site-scoped users cannot modify tenant master data.');
  }
}

async function writeAuditLog(input: {
  tenantId: string;
  actorId: string;
  eventType: string;
  metadata: Prisma.InputJsonValue;
}) {
  await prisma.auditLog.create({
    data: {
      tenantId: input.tenantId,
      actorId: input.actorId,
      actorType: 'STAFF',
      eventType: input.eventType,
      metadata: input.metadata,
    },
  });
}

async function ensureTenantSite(tenantId: string, siteId: string) {
  const site = await prisma.site.findFirst({
    where: { id: siteId, tenantId },
    select: { id: true },
  });
  if (!site) {
    throw new AppError(404, 'site_not_found', 'Site not found in this tenant.');
  }
}

async function ensureTenantVehicle(tenantId: string, vehicleId: string) {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, tenantId },
    select: { id: true },
  });
  if (!vehicle) {
    throw new AppError(404, 'vehicle_not_found', 'Vehicle not found in this tenant.');
  }
}

function parseOptionalServiceDate(value: string | null | undefined, fieldName: string): Date | null {
  if (value === undefined || value === null || value.trim() === '') {
    return null;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError(400, 'validation_error', `${fieldName} must be a valid date in YYYY-MM-DD format.`);
  }
  return parsed;
}

function formatServiceDate(value: Date | null): string | null {
  if (!value) {
    return null;
  }
  return value.toISOString().slice(0, 10);
}

async function getDriverProjectionForUser(tenantId: string, user: { id: string; username: string | null; employeeNo: string | null }) {
  if (!user.username && !user.employeeNo) {
    return null;
  }

  return prisma.driver.findFirst({
    where: {
      tenantId,
      OR: [
        ...(user.username ? [{ username: user.username }] : []),
        ...(user.employeeNo ? [{ employeeNumber: user.employeeNo }] : []),
      ],
    },
    orderBy: [{ createdAt: 'desc' }],
  });
}

async function ensureDriverProjection(input: {
  tenantId: string;
  user: {
    id: string;
    username: string | null;
    employeeNo: string | null;
    fullName: string;
    passwordHash: string;
  };
}) {
  const existing = await getDriverProjectionForUser(input.tenantId, input.user);
  if (existing) {
    return existing;
  }

  if (!input.user.username) {
    return null;
  }

  return prisma.driver.create({
    data: {
      tenantId: input.tenantId,
      username: input.user.username,
      employeeNumber: input.user.employeeNo,
      fullName: input.user.fullName,
      passwordHash: input.user.passwordHash,
      isActive: true,
    },
  });
}

async function setSingleSiteAssignment(tenantId: string, userId: string, siteId: string | null) {
  await prisma.user.update({
    where: { id: userId },
    data: { siteId },
  });

  await prisma.userSiteAssignment.deleteMany({
    where: {
      tenantId,
      userId,
    },
  });
  await prisma.userSiteAccess.deleteMany({
    where: {
      tenantId,
      userId,
    },
  });

  if (!siteId) {
    return;
  }

  await Promise.all([
    prisma.userSiteAssignment.create({
      data: {
        tenantId,
        userId,
        siteId,
      },
    }),
    prisma.userSiteAccess.create({
      data: {
        tenantId,
        userId,
        siteId,
      },
    }),
  ]);
}

async function setMultiSiteAccess(tenantId: string, userId: string, siteIds: string[]) {
  const uniqueSiteIds = [...new Set(siteIds)];
  await prisma.user.update({
    where: { id: userId },
    data: { siteId: uniqueSiteIds[0] ?? null },
  });

  await prisma.userSiteAccess.deleteMany({
    where: {
      tenantId,
      userId,
    },
  });

  if (uniqueSiteIds.length === 0) {
    await prisma.userSiteAssignment.deleteMany({
      where: {
        tenantId,
        userId,
      },
    });
    return;
  }

  await prisma.userSiteAccess.createMany({
    data: uniqueSiteIds.map((siteId) => ({
      tenantId,
      userId,
      siteId,
    })),
    skipDuplicates: true,
  });

  // Keep legacy single-assignment table in sync with primary site for backward compatibility.
  await prisma.userSiteAssignment.deleteMany({
    where: {
      tenantId,
      userId,
    },
  });
  await prisma.userSiteAssignment.create({
    data: {
      tenantId,
      userId,
      siteId: uniqueSiteIds[0]!,
    },
  });
}

async function setDriverVehicleAssignment(input: {
  tenantId: string;
  user: {
    id: string;
    username: string | null;
    employeeNo: string | null;
    fullName: string;
    passwordHash: string;
  };
  vehicleId: string | null;
}) {
  const projection = await ensureDriverProjection({
    tenantId: input.tenantId,
    user: input.user,
  });

  if (!projection) {
    return;
  }

  if (input.vehicleId) {
    await prisma.driver.updateMany({
      where: {
        tenantId: input.tenantId,
        assignedVehicleId: input.vehicleId,
      },
      data: {
        assignedVehicleId: null,
      },
    });
  } else if (projection.assignedVehicleId) {
    await prisma.driver.updateMany({
      where: {
        tenantId: input.tenantId,
        assignedVehicleId: projection.assignedVehicleId,
      },
      data: {
        assignedVehicleId: null,
      },
    });
  }

  await prisma.driver.update({
    where: {
      id: projection.id,
    },
    data: {
      assignedVehicleId: input.vehicleId,
    },
  });
}

export async function listMasterDrivers(tenantId: string, scope: DataScopeContext, search?: string, limit = 100) {
  if (!scope.isFullTenantScope && scope.allowedSiteIds.length === 0) {
    return [];
  }

  const users = await prisma.user.findMany({
    where: {
      tenantId,
      role: {
        in: [UserRole.DRIVER, UserRole.SITE_SUPERVISOR, UserRole.SAFETY_OFFICER, UserRole.TENANT_ADMIN, UserRole.TRANSPORT_MANAGER],
      },
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
                siteAccesses: {
                  some: {
                    siteId: { in: scope.allowedSiteIds },
                  },
                },
              },
            ],
          }
        : {}),
      ...(search
        ? {
            OR: [
              { fullName: { contains: search, mode: 'insensitive' } },
              { employeeNo: { contains: search, mode: 'insensitive' } },
              { username: { contains: search, mode: 'insensitive' } },
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
      isActive: true,
      role: true,
      siteAssignments: {
        orderBy: { createdAt: 'asc' },
        take: 1,
        select: {
          site: {
            select: {
              id: true,
              siteCode: true,
              siteName: true,
            },
          },
        },
      },
      siteAccesses: {
        orderBy: { createdAt: 'asc' },
        select: { siteId: true },
      },
      createdAt: true,
      passwordHash: true,
    },
  });

  const projections = await prisma.driver.findMany({
    where: {
      tenantId,
      OR: users.flatMap((user) => [
        ...(user.username ? [{ username: user.username }] : []),
        ...(user.employeeNo ? [{ employeeNumber: user.employeeNo }] : []),
      ]),
    },
    include: {
      assignedVehicle: {
        select: {
          id: true,
          fleetNumber: true,
          plateNumber: true,
        },
      },
    },
  });

  return users.map((user) => {
    const projection = projections.find(
      (candidate) =>
        (user.username && candidate.username === user.username) ||
        (user.employeeNo && candidate.employeeNumber === user.employeeNo),
    );

    return {
      id: user.id,
      full_name: user.fullName,
      employee_no: user.employeeNo,
      username: user.username,
      role: user.role,
      is_active: user.isActive,
      site: user.siteAssignments[0]?.site
        ? {
            id: user.siteAssignments[0].site.id,
            site_code: user.siteAssignments[0].site.siteCode,
            site_name: user.siteAssignments[0].site.siteName,
          }
        : null,
      assigned_vehicle: projection?.assignedVehicle
        ? {
            id: projection.assignedVehicle.id,
            fleet_no: projection.assignedVehicle.fleetNumber,
            plate_no: projection.assignedVehicle.plateNumber,
          }
        : null,
      site_ids: user.siteAccesses.map((item) => item.siteId),
      created_at: user.createdAt.toISOString(),
    };
  });
}

export async function createMasterDriver(input: {
  tenantId: string;
  actorId: string;
  actorRole: AuthContext['role'];
  payload: {
    full_name: string;
    role?: UserRole | undefined;
    employee_no?: string | null | undefined;
    username: string;
    site_id?: string | null | undefined;
    site_ids?: string[] | undefined;
    assigned_vehicle_id?: string | null | undefined;
    is_active?: boolean | undefined;
  };
}) {
  const role = input.payload.role ?? UserRole.DRIVER;
  const fullName = input.payload.full_name.trim();
  const username = input.payload.username.trim().toLowerCase();
  const employeeNo = input.payload.employee_no?.trim() || null;
  const siteId = input.payload.site_id ?? null;
  const siteIds = input.payload.site_ids ?? [];
  const assignedVehicleId = input.payload.assigned_vehicle_id ?? null;
  const isActive = input.payload.is_active ?? true;

  if (!fullName) {
    throw new AppError(400, 'validation_error', 'full_name is required.');
  }
  if (!username) {
    throw new AppError(400, 'validation_error', 'username is required.');
  }

  if (!canAssignRole(input.actorRole, role)) {
    throw new AppError(403, 'forbidden_role_assignment', 'Your role cannot create this user role.');
  }

  if (role === UserRole.TRANSPORT_MANAGER && input.actorRole !== 'TRANSPORT_MANAGER') {
    throw new AppError(403, 'forbidden_role_assignment', 'Only Transport Manager can manage governance roles.');
  }

  if (role === UserRole.TENANT_ADMIN && input.actorRole !== 'TRANSPORT_MANAGER') {
    throw new AppError(403, 'forbidden_role_assignment', 'Only Transport Manager can create Tenant Admin users.');
  }

  if (role === UserRole.SITE_SUPERVISOR && !siteId) {
    throw new AppError(400, 'validation_error', 'Site Supervisor requires a single site assignment.');
  }
  if (role === UserRole.SAFETY_OFFICER && siteIds.length === 0) {
    throw new AppError(400, 'validation_error', 'Safety Officer requires at least one site assignment.');
  }
  if (role !== UserRole.SAFETY_OFFICER && siteIds.length > 0) {
    throw new AppError(400, 'validation_error', 'site_ids is only allowed for Safety Officer.');
  }
  if ((role === UserRole.DRIVER || role === UserRole.SITE_SUPERVISOR) && siteIds.length > 0) {
    throw new AppError(400, 'validation_error', 'Use site_id for single-site roles.');
  }

  if (siteId) {
    await ensureTenantSite(input.tenantId, siteId);
  }
  for (const currentSiteId of siteIds) {
    await ensureTenantSite(input.tenantId, currentSiteId);
  }
  if (assignedVehicleId) {
    await ensureTenantVehicle(input.tenantId, assignedVehicleId);
  }
  if (role !== UserRole.DRIVER && assignedVehicleId) {
    throw new AppError(400, 'validation_error', 'assigned_vehicle_id is only allowed for DRIVER.');
  }

  const passwordHash = await hashPassword(randomUUID());
  const user = await prisma.user.create({
    data: {
      tenantId: input.tenantId,
      role,
      fullName,
      employeeNo,
      username,
      passwordHash,
      isActive,
    },
    select: {
      id: true,
      fullName: true,
      employeeNo: true,
      username: true,
      isActive: true,
      passwordHash: true,
    },
  });

  if (role === UserRole.DRIVER) {
    await ensureDriverProjection({
      tenantId: input.tenantId,
      user,
    });
  }
  if (role === UserRole.SAFETY_OFFICER) {
    await setMultiSiteAccess(input.tenantId, user.id, siteIds);
  } else {
    await setSingleSiteAssignment(input.tenantId, user.id, siteId);
  }
  if (role === UserRole.DRIVER) {
    await setDriverVehicleAssignment({
      tenantId: input.tenantId,
      user,
      vehicleId: assignedVehicleId,
    });
  }

  await writeAuditLog({
    tenantId: input.tenantId,
    actorId: input.actorId,
    eventType: 'MASTER_USER_CREATED',
    metadata: {
      user_id: user.id,
      role,
      username,
      employee_no: employeeNo,
      site_id: siteId,
      site_ids: siteIds,
      assigned_vehicle_id: assignedVehicleId,
      is_active: isActive,
    },
  });

  return user.id;
}

export async function updateMasterDriver(input: {
  tenantId: string;
  actorId: string;
  actorRole: AuthContext['role'];
  scope: DataScopeContext;
  id: string;
  route: string;
  payload: {
    role?: UserRole | undefined;
    full_name?: string | undefined;
    employee_no?: string | null | undefined;
    username?: string | undefined;
    site_id?: string | null | undefined;
    site_ids?: string[] | undefined;
    assigned_vehicle_id?: string | null | undefined;
    is_active?: boolean | undefined;
  };
}) {
  const existing = await prisma.user.findFirst({
    where: {
      id: input.id,
      tenantId: input.tenantId,
      role: {
        in: [UserRole.DRIVER, UserRole.SITE_SUPERVISOR, UserRole.SAFETY_OFFICER, UserRole.TENANT_ADMIN],
      },
    },
    select: {
      id: true,
      fullName: true,
      employeeNo: true,
      username: true,
      role: true,
      isActive: true,
      passwordHash: true,
      siteAssignments: { select: { siteId: true } },
      siteAccesses: { select: { siteId: true } },
    },
  });
  if (!existing) {
    throw new AppError(404, 'driver_not_found', 'Driver not found.');
  }

  if (!input.scope.isFullTenantScope) {
    const inScope =
      existing.siteAssignments.some((assignment) => input.scope.allowedSiteIds.includes(assignment.siteId)) ||
      existing.siteAccesses.some((assignment) => input.scope.allowedSiteIds.includes(assignment.siteId));
    if (!inScope) {
      await recordOutOfScopeAuditLog({
        tenantId: input.tenantId,
        actorId: input.actorId,
        route: input.route,
        resourceType: 'driver',
        resourceId: input.id,
      });
      throw new AppError(404, 'driver_not_found', 'Driver not found.');
    }
  }

  const nextFullName = input.payload.full_name === undefined ? existing.fullName : input.payload.full_name.trim();
  const nextEmployeeNo = input.payload.employee_no === undefined ? existing.employeeNo : input.payload.employee_no?.trim() || null;
  const nextUsername = input.payload.username === undefined ? existing.username : input.payload.username.trim().toLowerCase();
  const nextRole = input.payload.role ?? existing.role;
  const nextIsActive = input.payload.is_active === undefined ? existing.isActive : input.payload.is_active;
  const nextSiteId = input.payload.site_id;
  const nextSiteIds = input.payload.site_ids;
  const nextVehicleId = input.payload.assigned_vehicle_id;

  if (!nextFullName) {
    throw new AppError(400, 'validation_error', 'full_name cannot be empty.');
  }
  if (!nextUsername) {
    throw new AppError(400, 'validation_error', 'username cannot be empty.');
  }

  if (!canAssignRole(input.actorRole, nextRole)) {
    throw new AppError(403, 'forbidden_role_assignment', 'Your role cannot assign this user role.');
  }
  if (nextRole === UserRole.TENANT_ADMIN && input.actorRole !== 'TRANSPORT_MANAGER') {
    throw new AppError(403, 'forbidden_role_assignment', 'Only Transport Manager can assign Tenant Admin.');
  }
  if (nextRole === UserRole.TRANSPORT_MANAGER) {
    throw new AppError(400, 'validation_error', 'Transport Manager role cannot be assigned via this endpoint.');
  }

  if (nextSiteId) {
    await ensureTenantSite(input.tenantId, nextSiteId);
  }
  if (nextSiteIds) {
    for (const currentSiteId of nextSiteIds) {
      await ensureTenantSite(input.tenantId, currentSiteId);
    }
  }
  if (nextVehicleId) {
    await ensureTenantVehicle(input.tenantId, nextVehicleId);
  }
  if (nextRole !== UserRole.DRIVER && nextVehicleId !== undefined && nextVehicleId !== null) {
    throw new AppError(400, 'validation_error', 'assigned_vehicle_id is only allowed for DRIVER.');
  }
  if (nextRole === UserRole.SITE_SUPERVISOR && nextSiteId === undefined && existing.siteAssignments.length === 0 && existing.siteAccesses.length === 0) {
    throw new AppError(400, 'validation_error', 'Site Supervisor requires a site assignment.');
  }
  if (nextRole === UserRole.SAFETY_OFFICER && nextSiteIds !== undefined && nextSiteIds.length === 0) {
    throw new AppError(400, 'validation_error', 'Safety Officer requires at least one assigned site.');
  }

  const updated = await prisma.user.update({
    where: {
      id: existing.id,
    },
    data: {
      fullName: nextFullName,
      employeeNo: nextEmployeeNo,
      username: nextUsername,
      role: nextRole,
      isActive: nextIsActive,
    },
    select: {
      id: true,
      fullName: true,
      employeeNo: true,
      username: true,
      isActive: true,
      passwordHash: true,
    },
  });

  const projection =
    nextRole === UserRole.DRIVER
      ? await ensureDriverProjection({
          tenantId: input.tenantId,
          user: updated,
        })
      : null;

  if (projection && nextRole === UserRole.DRIVER) {
    await prisma.driver.update({
      where: { id: projection.id },
      data: {
        fullName: updated.fullName,
        username: updated.username!,
        employeeNumber: updated.employeeNo,
        isActive: updated.isActive,
        ...(nextSiteId !== undefined ? { siteId: nextSiteId } : {}),
      },
    });
  }

  if (nextSiteId !== undefined) {
    await setSingleSiteAssignment(input.tenantId, updated.id, nextSiteId);
  }
  if (nextSiteIds !== undefined) {
    await setMultiSiteAccess(input.tenantId, updated.id, nextSiteIds);
  }
  if (nextVehicleId !== undefined && nextRole === UserRole.DRIVER) {
    await setDriverVehicleAssignment({
      tenantId: input.tenantId,
      user: updated,
      vehicleId: nextVehicleId,
    });
  }

  await writeAuditLog({
    tenantId: input.tenantId,
    actorId: input.actorId,
    eventType: existing.isActive !== nextIsActive ? 'MASTER_USER_STATUS_CHANGED' : 'MASTER_USER_UPDATED',
    metadata: {
      user_id: updated.id,
      role: nextRole,
      username: updated.username,
      employee_no: updated.employeeNo,
      site_id: nextSiteId,
      site_ids: nextSiteIds ?? null,
      assigned_vehicle_id: nextVehicleId,
      is_active: updated.isActive,
    },
  });
}

export async function resetMasterDriverPassword(input: {
  tenantId: string;
  actorId: string;
  actorRole: AuthContext['role'];
  scope: DataScopeContext;
  id: string;
  route: string;
}) {
  if (!canManageMasterData(input.actorRole)) {
    throw new AppError(403, 'forbidden_master_data_write', 'Your role cannot reset user credentials.');
  }

  if (!input.scope.isFullTenantScope) {
    throw new AppError(403, 'forbidden_master_data_write', 'Site-scoped users cannot reset user credentials.');
  }

  const existing = await prisma.user.findFirst({
    where: {
      id: input.id,
      tenantId: input.tenantId,
      role: {
        in: [UserRole.DRIVER, UserRole.SITE_SUPERVISOR, UserRole.SAFETY_OFFICER, UserRole.TENANT_ADMIN],
      },
    },
    select: {
      id: true,
      role: true,
      username: true,
      employeeNo: true,
      siteAssignments: { select: { siteId: true } },
      siteAccesses: { select: { siteId: true } },
    },
  });
  if (!existing) {
    throw new AppError(404, 'driver_not_found', 'User not found.');
  }

  if (!canAssignRole(input.actorRole, existing.role)) {
    throw new AppError(403, 'forbidden_role_assignment', 'Your role cannot reset this user.');
  }

  const inScope =
    existing.siteAssignments.some((assignment) => input.scope.allowedSiteIds.includes(assignment.siteId)) ||
    existing.siteAccesses.some((assignment) => input.scope.allowedSiteIds.includes(assignment.siteId));
  if (!input.scope.isFullTenantScope && !inScope) {
    await recordOutOfScopeAuditLog({
      tenantId: input.tenantId,
      actorId: input.actorId,
      route: input.route,
      resourceType: 'driver',
      resourceId: input.id,
    });
    throw new AppError(404, 'driver_not_found', 'User not found.');
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: {
        id: existing.id,
      },
      data: {
        passwordHash,
      },
    });

    await tx.userAuth.upsert({
      where: { userId: existing.id },
      update: {
        passwordHash,
        forcePasswordChange: true,
      },
      create: {
        userId: existing.id,
        passwordHash,
        forcePasswordChange: true,
      },
    });

    const projection = await tx.driver.findFirst({
      where: {
        tenantId: input.tenantId,
        OR: [
          ...(existing.username ? [{ username: existing.username }] : []),
          ...(existing.employeeNo ? [{ employeeNumber: existing.employeeNo }] : []),
        ],
      },
      select: { id: true },
    });

    if (projection) {
      await tx.driver.update({
        where: { id: projection.id },
        data: { passwordHash },
      });
    }

    await tx.auditLog.create({
      data: {
        tenantId: input.tenantId,
        actorId: input.actorId,
        actorType: 'STAFF',
        eventType: 'MASTER_USER_PASSWORD_RESET',
        metadata: {
          user_id: existing.id,
          role: existing.role,
          force_password_change: true,
        },
      },
    });
  });

  return {
    user_id: existing.id,
    username: existing.username,
    role: existing.role,
    force_password_change: true as const,
    temporary_password: temporaryPassword,
  };
}

export async function listMasterVehicles(tenantId: string, scope: DataScopeContext, search?: string, limit = 100) {
  if (!scope.isFullTenantScope && scope.allowedSiteIds.length === 0) {
    return [];
  }

  const vehicles = await prisma.vehicle.findMany({
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
      drivers: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          id: true,
          username: true,
          employeeNumber: true,
          fullName: true,
        },
      },
    },
  });

  const driverRefs = vehicles
    .map((vehicle) => vehicle.drivers[0])
    .filter((value): value is NonNullable<typeof value> => Boolean(value));

  const users = await prisma.user.findMany({
    where: {
      tenantId,
      role: UserRole.DRIVER,
      OR: driverRefs.flatMap((driver) => [
        ...(driver.username ? [{ username: driver.username }] : []),
        ...(driver.employeeNumber ? [{ employeeNo: driver.employeeNumber }] : []),
      ]),
    },
    select: {
      id: true,
      username: true,
      employeeNo: true,
    },
  });

  return vehicles.map((vehicle) => {
    const assignedProjection = vehicle.drivers[0] ?? null;
    const assignedUser = assignedProjection
      ? users.find(
          (user) =>
            (assignedProjection.username && user.username === assignedProjection.username) ||
            (assignedProjection.employeeNumber && user.employeeNo === assignedProjection.employeeNumber),
        )
      : null;
    return {
      id: vehicle.id,
      fleet_no: vehicle.fleetNumber,
      plate_no: vehicle.plateNumber,
      last_service_date: formatServiceDate(vehicle.lastServiceDate),
      last_service_odometer_km: vehicle.lastServiceOdometerKm,
      next_service_odometer_km: vehicle.nextServiceOdometerKm,
      service_interval_km: vehicle.serviceIntervalKm,
      is_active: vehicle.isActive,
      site: vehicle.site
        ? {
            id: vehicle.site.id,
            site_code: vehicle.site.siteCode,
            site_name: vehicle.site.siteName,
          }
        : null,
      assigned_driver: assignedProjection
        ? {
            user_id: assignedUser?.id ?? null,
            full_name: assignedProjection.fullName,
          }
        : null,
    };
  });
}

export async function createMasterVehicle(input: {
  tenantId: string;
  actorId: string;
  payload: {
    fleet_no: string;
    plate_no?: string | null | undefined;
    last_service_date?: string | null | undefined;
    last_service_odometer_km?: number | null | undefined;
    next_service_odometer_km?: number | null | undefined;
    service_interval_km?: number | null | undefined;
    site_id?: string | null | undefined;
    assigned_driver_user_id?: string | null | undefined;
    is_active?: boolean | undefined;
  };
}) {
  const fleetNo = input.payload.fleet_no.trim();
  if (!fleetNo) {
    throw new AppError(400, 'validation_error', 'fleet_no is required.');
  }

  const siteId = input.payload.site_id ?? null;
  if (siteId) {
    await ensureTenantSite(input.tenantId, siteId);
  }
  const lastServiceDate = parseOptionalServiceDate(input.payload.last_service_date, 'last_service_date');

  const vehicle = await prisma.vehicle.create({
    data: {
      tenantId: input.tenantId,
      fleetNumber: fleetNo,
      plateNumber: input.payload.plate_no?.trim() || null,
      lastServiceDate,
      lastServiceOdometerKm: input.payload.last_service_odometer_km ?? null,
      nextServiceOdometerKm: input.payload.next_service_odometer_km ?? null,
      serviceIntervalKm: input.payload.service_interval_km ?? null,
      siteId,
      isActive: input.payload.is_active ?? true,
    },
    select: {
      id: true,
    },
  });

  if (input.payload.assigned_driver_user_id) {
    await assignVehicleToDriverUser({
      tenantId: input.tenantId,
      vehicleId: vehicle.id,
      driverUserId: input.payload.assigned_driver_user_id,
    });
  }

  await writeAuditLog({
    tenantId: input.tenantId,
    actorId: input.actorId,
    eventType: 'MASTER_VEHICLE_CREATED',
    metadata: {
      vehicle_id: vehicle.id,
      fleet_no: fleetNo,
      last_service_date: input.payload.last_service_date ?? null,
      last_service_odometer_km: input.payload.last_service_odometer_km ?? null,
      next_service_odometer_km: input.payload.next_service_odometer_km ?? null,
      service_interval_km: input.payload.service_interval_km ?? null,
      site_id: siteId,
      assigned_driver_user_id: input.payload.assigned_driver_user_id ?? null,
      is_active: input.payload.is_active ?? true,
    },
  });

  return vehicle.id;
}

async function assignVehicleToDriverUser(input: {
  tenantId: string;
  vehicleId: string;
  driverUserId: string | null;
}) {
  await prisma.driver.updateMany({
    where: {
      tenantId: input.tenantId,
      assignedVehicleId: input.vehicleId,
    },
    data: {
      assignedVehicleId: null,
    },
  });

  if (!input.driverUserId) {
    return;
  }

  const user = await prisma.user.findFirst({
    where: {
      id: input.driverUserId,
      tenantId: input.tenantId,
      role: UserRole.DRIVER,
    },
    select: {
      id: true,
      username: true,
      employeeNo: true,
      fullName: true,
      passwordHash: true,
    },
  });
  if (!user) {
    throw new AppError(404, 'driver_not_found', 'Assigned driver not found.');
  }

  const projection = await ensureDriverProjection({
    tenantId: input.tenantId,
    user,
  });
  if (!projection) {
    throw new AppError(400, 'driver_projection_missing', 'Assigned driver cannot be linked to a vehicle.');
  }

  await prisma.driver.update({
    where: { id: projection.id },
    data: {
      assignedVehicleId: input.vehicleId,
    },
  });
}

export async function updateMasterVehicle(input: {
  tenantId: string;
  actorId: string;
  scope: DataScopeContext;
  id: string;
  route: string;
  payload: {
    fleet_no?: string | undefined;
    plate_no?: string | null | undefined;
    last_service_date?: string | null | undefined;
    last_service_odometer_km?: number | null | undefined;
    next_service_odometer_km?: number | null | undefined;
    service_interval_km?: number | null | undefined;
    site_id?: string | null | undefined;
    assigned_driver_user_id?: string | null | undefined;
    is_active?: boolean | undefined;
  };
}) {
  const existing = await prisma.vehicle.findFirst({
    where: {
      id: input.id,
      tenantId: input.tenantId,
    },
    select: {
      id: true,
      fleetNumber: true,
      plateNumber: true,
      lastServiceDate: true,
      lastServiceOdometerKm: true,
      nextServiceOdometerKm: true,
      serviceIntervalKm: true,
      siteId: true,
      isActive: true,
    },
  });
  if (!existing) {
    throw new AppError(404, 'vehicle_not_found', 'Vehicle not found.');
  }

  if (!input.scope.isFullTenantScope) {
    const siteId = existing.siteId;
    if (siteId && !input.scope.allowedSiteIds.includes(siteId)) {
      await recordOutOfScopeAuditLog({
        tenantId: input.tenantId,
        actorId: input.actorId,
        route: input.route,
        resourceType: 'vehicle',
        resourceId: input.id,
      });
      throw new AppError(404, 'vehicle_not_found', 'Vehicle not found.');
    }
  }

  const nextFleetNo = input.payload.fleet_no === undefined ? existing.fleetNumber : input.payload.fleet_no.trim();
  if (!nextFleetNo) {
    throw new AppError(400, 'validation_error', 'fleet_no cannot be empty.');
  }
  const nextSiteId = input.payload.site_id;
  if (nextSiteId) {
    await ensureTenantSite(input.tenantId, nextSiteId);
  }
  const nextLastServiceDate =
    input.payload.last_service_date === undefined
      ? existing.lastServiceDate
      : parseOptionalServiceDate(input.payload.last_service_date, 'last_service_date');

  await prisma.vehicle.update({
    where: {
      id: existing.id,
    },
    data: {
      fleetNumber: nextFleetNo,
      ...(input.payload.plate_no !== undefined ? { plateNumber: input.payload.plate_no?.trim() || null } : {}),
      ...(input.payload.last_service_date !== undefined ? { lastServiceDate: nextLastServiceDate } : {}),
      ...(input.payload.last_service_odometer_km !== undefined
        ? { lastServiceOdometerKm: input.payload.last_service_odometer_km }
        : {}),
      ...(input.payload.next_service_odometer_km !== undefined
        ? { nextServiceOdometerKm: input.payload.next_service_odometer_km }
        : {}),
      ...(input.payload.service_interval_km !== undefined ? { serviceIntervalKm: input.payload.service_interval_km } : {}),
      ...(nextSiteId !== undefined ? { siteId: nextSiteId } : {}),
      ...(input.payload.is_active !== undefined ? { isActive: input.payload.is_active } : {}),
    },
  });

  if (input.payload.assigned_driver_user_id !== undefined) {
    await assignVehicleToDriverUser({
      tenantId: input.tenantId,
      vehicleId: existing.id,
      driverUserId: input.payload.assigned_driver_user_id,
    });
  }

  await writeAuditLog({
    tenantId: input.tenantId,
    actorId: input.actorId,
    eventType:
      input.payload.is_active !== undefined && input.payload.is_active !== existing.isActive
        ? 'MASTER_VEHICLE_STATUS_CHANGED'
        : 'MASTER_VEHICLE_UPDATED',
    metadata: {
      vehicle_id: existing.id,
      fleet_no: nextFleetNo,
      last_service_date:
        input.payload.last_service_date === undefined ? formatServiceDate(existing.lastServiceDate) : input.payload.last_service_date,
      last_service_odometer_km: input.payload.last_service_odometer_km ?? existing.lastServiceOdometerKm ?? null,
      next_service_odometer_km: input.payload.next_service_odometer_km ?? existing.nextServiceOdometerKm ?? null,
      service_interval_km: input.payload.service_interval_km ?? existing.serviceIntervalKm ?? null,
      site_id: nextSiteId,
      assigned_driver_user_id: input.payload.assigned_driver_user_id ?? null,
      is_active: input.payload.is_active ?? existing.isActive,
    },
  });
}

export async function createMasterSite(input: {
  tenantId: string;
  actorId: string;
  payload: {
    site_code: string;
    site_name: string;
    location?: string | null | undefined;
    is_active?: boolean | undefined;
  };
}) {
  const siteCode = input.payload.site_code.trim();
  const siteName = input.payload.site_name.trim();

  if (!siteCode || !siteName) {
    throw new AppError(400, 'validation_error', 'site_code and site_name are required.');
  }

  const site = await prisma.site.create({
    data: {
      tenantId: input.tenantId,
      siteCode,
      siteName,
      location: input.payload.location?.trim() || null,
      isActive: input.payload.is_active ?? true,
    },
    select: { id: true },
  });

  await writeAuditLog({
    tenantId: input.tenantId,
    actorId: input.actorId,
    eventType: 'MASTER_SITE_CREATED',
    metadata: {
      site_id: site.id,
      site_code: siteCode,
      site_name: siteName,
      is_active: input.payload.is_active ?? true,
    },
  });

  return site.id;
}

export async function updateMasterSite(input: {
  tenantId: string;
  actorId: string;
  scope: DataScopeContext;
  id: string;
  route: string;
  payload: {
    site_code?: string | undefined;
    site_name?: string | undefined;
    location?: string | null | undefined;
    is_active?: boolean | undefined;
  };
}) {
  const existing = await prisma.site.findFirst({
    where: {
      id: input.id,
      tenantId: input.tenantId,
    },
    select: {
      id: true,
      siteCode: true,
      siteName: true,
      location: true,
      isActive: true,
    },
  });
  if (!existing) {
    throw new AppError(404, 'site_not_found', 'Site not found.');
  }

  if (!input.scope.isFullTenantScope && !input.scope.allowedSiteIds.includes(existing.id)) {
    await recordOutOfScopeAuditLog({
      tenantId: input.tenantId,
      actorId: input.actorId,
      route: input.route,
      resourceType: 'site',
      resourceId: input.id,
    });
    throw new AppError(404, 'site_not_found', 'Site not found.');
  }

  const nextCode = input.payload.site_code === undefined ? existing.siteCode : input.payload.site_code.trim();
  const nextName = input.payload.site_name === undefined ? existing.siteName : input.payload.site_name.trim();

  if (!nextCode || !nextName) {
    throw new AppError(400, 'validation_error', 'site_code and site_name cannot be empty.');
  }

  await prisma.site.update({
    where: { id: existing.id },
    data: {
      siteCode: nextCode,
      siteName: nextName,
      ...(input.payload.location !== undefined ? { location: input.payload.location?.trim() || null } : {}),
      ...(input.payload.is_active !== undefined ? { isActive: input.payload.is_active } : {}),
    },
  });

  await writeAuditLog({
    tenantId: input.tenantId,
    actorId: input.actorId,
    eventType:
      input.payload.is_active !== undefined && input.payload.is_active !== existing.isActive
        ? 'MASTER_SITE_STATUS_CHANGED'
        : 'MASTER_SITE_UPDATED',
    metadata: {
      site_id: existing.id,
      site_code: nextCode,
      site_name: nextName,
      is_active: input.payload.is_active ?? existing.isActive,
    },
  });
}

export async function createMasterTank(input: {
  tenantId: string;
  actorId: string;
  payload: {
    tank_name: string;
    capacity_l: string;
    reorder_level_l: string;
    site_id: string;
  };
}) {
  const tankName = input.payload.tank_name.trim();
  if (!tankName) {
    throw new AppError(400, 'validation_error', 'tank_name is required.');
  }
  await ensureTenantSite(input.tenantId, input.payload.site_id);

  const capacity = Number(input.payload.capacity_l);
  const reorder = Number(input.payload.reorder_level_l);
  if (!Number.isFinite(capacity) || capacity <= 0 || !Number.isFinite(reorder) || reorder < 0 || reorder > capacity) {
    throw new AppError(400, 'validation_error', 'Tank capacity/reorder values are invalid.');
  }

  const tank = await prisma.tank.create({
    data: {
      tenantId: input.tenantId,
      siteId: input.payload.site_id,
      tankName,
      capacityL: new Prisma.Decimal(capacity.toFixed(2)),
      reorderLevelL: new Prisma.Decimal(reorder.toFixed(2)),
    },
    select: { id: true },
  });

  await writeAuditLog({
    tenantId: input.tenantId,
    actorId: input.actorId,
    eventType: 'MASTER_TANK_CREATED',
    metadata: {
      tank_id: tank.id,
      tank_name: tankName,
      site_id: input.payload.site_id,
      capacity_l: capacity,
      reorder_level_l: reorder,
    },
  });

  return tank.id;
}

export async function updateMasterTank(input: {
  tenantId: string;
  actorId: string;
  scope: DataScopeContext;
  id: string;
  route: string;
  payload: {
    tank_name?: string | undefined;
    capacity_l?: string | undefined;
    reorder_level_l?: string | undefined;
    site_id?: string | undefined;
  };
}) {
  const existing = await prisma.tank.findFirst({
    where: {
      id: input.id,
      tenantId: input.tenantId,
    },
    select: {
      id: true,
      tankName: true,
      capacityL: true,
      reorderLevelL: true,
      siteId: true,
    },
  });
  if (!existing) {
    throw new AppError(404, 'tank_not_found', 'Tank not found.');
  }

  if (!input.scope.isFullTenantScope && !input.scope.allowedSiteIds.includes(existing.siteId)) {
    await recordOutOfScopeAuditLog({
      tenantId: input.tenantId,
      actorId: input.actorId,
      route: input.route,
      resourceType: 'tank',
      resourceId: input.id,
    });
    throw new AppError(404, 'tank_not_found', 'Tank not found.');
  }

  const nextName = input.payload.tank_name === undefined ? existing.tankName : input.payload.tank_name.trim();
  const nextCapacity =
    input.payload.capacity_l === undefined ? Number(existing.capacityL.toString()) : Number(input.payload.capacity_l);
  const nextReorder =
    input.payload.reorder_level_l === undefined
      ? Number(existing.reorderLevelL.toString())
      : Number(input.payload.reorder_level_l);
  const nextSiteId = input.payload.site_id === undefined ? existing.siteId : input.payload.site_id;

  if (!nextName) {
    throw new AppError(400, 'validation_error', 'tank_name cannot be empty.');
  }
  if (!Number.isFinite(nextCapacity) || nextCapacity <= 0 || !Number.isFinite(nextReorder) || nextReorder < 0 || nextReorder > nextCapacity) {
    throw new AppError(400, 'validation_error', 'Tank capacity/reorder values are invalid.');
  }

  if (nextSiteId) {
    await ensureTenantSite(input.tenantId, nextSiteId);
  }

  await prisma.tank.update({
    where: {
      id: existing.id,
    },
    data: {
      tankName: nextName,
      siteId: nextSiteId,
      capacityL: new Prisma.Decimal(nextCapacity.toFixed(2)),
      reorderLevelL: new Prisma.Decimal(nextReorder.toFixed(2)),
    },
  });

  await writeAuditLog({
    tenantId: input.tenantId,
    actorId: input.actorId,
    eventType: 'MASTER_TANK_UPDATED',
    metadata: {
      tank_id: existing.id,
      tank_name: nextName,
      site_id: nextSiteId,
      capacity_l: nextCapacity,
      reorder_level_l: nextReorder,
    },
  });
}
