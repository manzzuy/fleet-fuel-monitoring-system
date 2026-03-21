import { Prisma, UserRole } from '@prisma/client';

import type {
  PlatformSupportModeResponse,
  PlatformSupportTenantUserRecord,
  PlatformSupportUserUpdateRequest,
} from '@fleet-fuel/shared';

import { prisma } from '../db/prisma';
import { AppError } from '../utils/errors';
import { signAccessToken } from '../utils/jwt';
import { hashPassword } from '../utils/password';

interface SupportUserSnapshot {
  role: UserRole;
  full_name: string;
  email: string | null;
  username: string | null;
  employee_no: string | null;
  is_active: boolean;
  site_id: string | null;
  site_ids: string[];
  assigned_vehicle_id: string | null;
}

const singleSiteRoles = new Set<UserRole>([UserRole.DRIVER, UserRole.SITE_SUPERVISOR]);
const multiSiteRoles = new Set<UserRole>([UserRole.SAFETY_OFFICER]);

function uniqueSiteIds(siteIds: string[] | undefined): string[] {
  if (!siteIds) {
    return [];
  }
  return Array.from(new Set(siteIds.map((item) => item.trim()).filter(Boolean)));
}

async function ensureTenantExists(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true },
  });
  if (!tenant) {
    throw new AppError(404, 'tenant_not_found', 'Tenant not found.');
  }
}

async function ensureTenantSites(tenantId: string, siteIds: string[]) {
  if (siteIds.length === 0) {
    return;
  }
  const count = await prisma.site.count({
    where: {
      tenantId,
      id: { in: siteIds },
    },
  });
  if (count !== siteIds.length) {
    throw new AppError(400, 'invalid_site_assignment', 'One or more selected sites do not belong to this tenant.');
  }
}

async function ensureTenantVehicle(tenantId: string, vehicleId: string | null) {
  if (!vehicleId) {
    return;
  }
  const vehicle = await prisma.vehicle.findFirst({
    where: { tenantId, id: vehicleId },
    select: { id: true },
  });
  if (!vehicle) {
    throw new AppError(400, 'invalid_vehicle_assignment', 'Assigned vehicle does not belong to this tenant.');
  }
}

function validateSupportUpdate(input: {
  role: UserRole;
  siteId: string | null;
  siteIds: string[];
  assignedVehicleId: string | null;
}) {
  if (input.role === UserRole.DRIVER && !input.siteId) {
    throw new AppError(400, 'validation_error', 'Driver must have a single site assignment.');
  }

  if (input.role === UserRole.SITE_SUPERVISOR && !input.siteId) {
    throw new AppError(400, 'validation_error', 'Site Supervisor must have a single site assignment.');
  }

  if (input.role === UserRole.SAFETY_OFFICER && input.siteIds.length === 0) {
    throw new AppError(400, 'validation_error', 'Safety Officer requires at least one site assignment.');
  }

  if (input.role !== UserRole.SAFETY_OFFICER && input.siteIds.length > 0) {
    throw new AppError(400, 'validation_error', 'site_ids is only allowed for Safety Officer.');
  }

  if (input.role !== UserRole.DRIVER && input.assignedVehicleId) {
    throw new AppError(400, 'validation_error', 'assigned_vehicle_id is only allowed for Driver.');
  }
}

async function buildSupportUserRecord(
  user: {
    id: string;
    tenantId: string;
    role: UserRole;
    fullName: string;
    email: string | null;
    username: string | null;
    employeeNo: string | null;
    isActive: boolean;
    createdAt: Date;
    siteAssignments: Array<{ siteId: string }>;
    siteAccesses: Array<{ siteId: string }>;
  },
  assignedVehicleId: string | null,
): Promise<PlatformSupportTenantUserRecord> {
  const siteId = user.siteAssignments[0]?.siteId ?? null;
  const siteIds = user.siteAccesses.map((item) => item.siteId);
  return {
    id: user.id,
    tenant_id: user.tenantId,
    role: user.role,
    full_name: user.fullName,
    email: user.email,
    username: user.username,
    employee_no: user.employeeNo,
    is_active: user.isActive,
    site_id: siteId,
    site_ids: siteIds,
    assigned_vehicle_id: assignedVehicleId,
    created_at: user.createdAt.toISOString(),
  };
}

async function findDriverProjection(tenantId: string, username: string | null, employeeNo: string | null) {
  const or = [
    ...(username ? [{ username }] : []),
    ...(employeeNo ? [{ employeeNumber: employeeNo }] : []),
  ];
  if (or.length === 0) {
    return null;
  }
  return prisma.driver.findFirst({
    where: {
      tenantId,
      OR: or,
    },
    select: {
      id: true,
      assignedVehicleId: true,
    },
  });
}

export async function enterPlatformSupportMode(
  platformUserId: string,
  requestId: string,
): Promise<PlatformSupportModeResponse> {
  const user = await prisma.platformUser.findUnique({
    where: { id: platformUserId },
    select: { id: true, role: true },
  });

  if (!user || user.role !== 'PLATFORM_OWNER') {
    throw new AppError(403, 'platform_auth_required', 'Platform owner access is required.');
  }

  await prisma.auditLog.create({
    data: {
      tenantId: null,
      actorId: platformUserId,
      actorType: 'PLATFORM',
      eventType: 'PLATFORM_SUPPORT_MODE_ENTERED',
      metadata: {
        request_id: requestId,
      },
    },
  });

  const accessToken = signAccessToken({
    sub: user.id,
    tenant_id: null,
    role: user.role,
    actor_type: 'PLATFORM',
    support_mode: true,
  });

  return {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: '15m',
    tenant_id: null,
    role: 'PLATFORM_OWNER',
    actor_type: 'PLATFORM',
    support_mode: true,
  };
}

export async function listSupportTenantUsers(tenantId: string): Promise<PlatformSupportTenantUserRecord[]> {
  await ensureTenantExists(tenantId);

  const users = await prisma.user.findMany({
    where: { tenantId },
    orderBy: [{ createdAt: 'desc' }],
    select: {
      id: true,
      tenantId: true,
      role: true,
      fullName: true,
      email: true,
      username: true,
      employeeNo: true,
      isActive: true,
      createdAt: true,
      siteAssignments: {
        orderBy: { createdAt: 'asc' },
        take: 1,
        select: { siteId: true },
      },
      siteAccesses: {
        orderBy: { createdAt: 'asc' },
        select: { siteId: true },
      },
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
    select: {
      id: true,
      username: true,
      employeeNumber: true,
      assignedVehicleId: true,
    },
  });

  return Promise.all(
    users.map(async (user) => {
      const projection = projections.find(
        (candidate) =>
          (user.username && candidate.username === user.username) ||
          (user.employeeNo && candidate.employeeNumber === user.employeeNo),
      );
      return buildSupportUserRecord(user, projection?.assignedVehicleId ?? null);
    }),
  );
}

export async function updateSupportTenantUser(input: {
  tenantId: string;
  userId: string;
  platformUserId: string;
  payload: PlatformSupportUserUpdateRequest;
}) {
  await ensureTenantExists(input.tenantId);

  const existing = await prisma.user.findFirst({
    where: {
      id: input.userId,
      tenantId: input.tenantId,
    },
    select: {
      id: true,
      tenantId: true,
      role: true,
      fullName: true,
      email: true,
      username: true,
      employeeNo: true,
      isActive: true,
      passwordHash: true,
      createdAt: true,
      siteAssignments: {
        orderBy: { createdAt: 'asc' },
        take: 1,
        select: { siteId: true },
      },
      siteAccesses: {
        orderBy: { createdAt: 'asc' },
        select: { siteId: true },
      },
    },
  });

  if (!existing) {
    throw new AppError(404, 'user_not_found', 'Tenant user was not found.');
  }

  const existingProjection = await findDriverProjection(input.tenantId, existing.username, existing.employeeNo);

  const nextRole = input.payload.role ? (input.payload.role as UserRole) : existing.role;
  const nextFullName = input.payload.full_name === undefined ? existing.fullName : input.payload.full_name.trim();
  const nextEmail = input.payload.email === undefined ? existing.email : input.payload.email?.trim().toLowerCase() ?? null;
  const nextUsername =
    input.payload.username === undefined ? existing.username : input.payload.username?.trim().toLowerCase() ?? null;
  const nextEmployeeNo =
    input.payload.employee_no === undefined ? existing.employeeNo : input.payload.employee_no?.trim() ?? null;
  const nextIsActive = input.payload.is_active === undefined ? existing.isActive : input.payload.is_active;
  const nextSiteId =
    input.payload.site_id === undefined ? existing.siteAssignments[0]?.siteId ?? null : input.payload.site_id;
  const nextSiteIds =
    input.payload.site_ids === undefined ? existing.siteAccesses.map((item) => item.siteId) : uniqueSiteIds(input.payload.site_ids);
  const nextAssignedVehicleId =
    input.payload.assigned_vehicle_id === undefined
      ? existingProjection?.assignedVehicleId ?? null
      : input.payload.assigned_vehicle_id;

  if (!nextFullName) {
    throw new AppError(400, 'validation_error', 'full_name cannot be empty.');
  }
  if (!nextUsername) {
    throw new AppError(400, 'validation_error', 'username cannot be empty.');
  }

  validateSupportUpdate({
    role: nextRole,
    siteId: nextSiteId,
    siteIds: nextSiteIds,
    assignedVehicleId: nextAssignedVehicleId,
  });

  const scopedSiteIds = singleSiteRoles.has(nextRole)
    ? (nextSiteId ? [nextSiteId] : [])
    : multiSiteRoles.has(nextRole)
      ? nextSiteIds
      : [];
  await ensureTenantSites(input.tenantId, scopedSiteIds);
  await ensureTenantVehicle(input.tenantId, nextAssignedVehicleId);

  const beforeSnapshot: SupportUserSnapshot = {
    role: existing.role,
    full_name: existing.fullName,
    email: existing.email,
    username: existing.username,
    employee_no: existing.employeeNo,
    is_active: existing.isActive,
    site_id: existing.siteAssignments[0]?.siteId ?? null,
    site_ids: existing.siteAccesses.map((item) => item.siteId),
    assigned_vehicle_id: existingProjection?.assignedVehicleId ?? null,
  };

  const updated = await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: existing.id },
      data: {
        role: nextRole,
        fullName: nextFullName,
        email: nextEmail,
        username: nextUsername,
        employeeNo: nextEmployeeNo,
        isActive: nextIsActive,
        siteId: singleSiteRoles.has(nextRole) ? nextSiteId : null,
      },
      select: {
        id: true,
        tenantId: true,
        role: true,
        fullName: true,
        email: true,
        username: true,
        employeeNo: true,
        isActive: true,
        passwordHash: true,
        createdAt: true,
      },
    });

    await tx.userSiteAssignment.deleteMany({
      where: {
        tenantId: input.tenantId,
        userId: user.id,
      },
    });
    await tx.userSiteAccess.deleteMany({
      where: {
        tenantId: input.tenantId,
        userId: user.id,
      },
    });

    if (singleSiteRoles.has(nextRole) && nextSiteId) {
      await tx.userSiteAssignment.create({
        data: {
          tenantId: input.tenantId,
          userId: user.id,
          siteId: nextSiteId,
        },
      });
    }
    if (multiSiteRoles.has(nextRole) && nextSiteIds.length > 0) {
      await tx.userSiteAccess.createMany({
        data: nextSiteIds.map((siteId) => ({
          tenantId: input.tenantId,
          userId: user.id,
          siteId,
        })),
      });
    }

    const projection = await tx.driver.findFirst({
      where: {
        tenantId: input.tenantId,
        OR: [
          ...(existing.username ? [{ username: existing.username }] : []),
          ...(existing.employeeNo ? [{ employeeNumber: existing.employeeNo }] : []),
          ...(nextUsername ? [{ username: nextUsername }] : []),
          ...(nextEmployeeNo ? [{ employeeNumber: nextEmployeeNo }] : []),
        ],
      },
      select: {
        id: true,
      },
    });

    if (nextRole === UserRole.DRIVER) {
      if (projection) {
        await tx.driver.update({
          where: { id: projection.id },
          data: {
            username: nextUsername,
            employeeNumber: nextEmployeeNo,
            fullName: nextFullName,
            passwordHash: user.passwordHash,
            isActive: nextIsActive,
            siteId: nextSiteId,
            assignedVehicleId: nextAssignedVehicleId,
          },
        });
      } else {
        await tx.driver.create({
          data: {
            tenantId: input.tenantId,
            username: nextUsername,
            employeeNumber: nextEmployeeNo,
            fullName: nextFullName,
            passwordHash: user.passwordHash,
            isActive: nextIsActive,
            siteId: nextSiteId,
            assignedVehicleId: nextAssignedVehicleId,
          },
        });
      }
    } else if (projection) {
      await tx.driver.update({
        where: { id: projection.id },
        data: {
          isActive: false,
          siteId: null,
          assignedVehicleId: null,
        },
      });
    }

    const siteAssignments = await tx.userSiteAssignment.findMany({
      where: { tenantId: input.tenantId, userId: user.id },
      orderBy: { createdAt: 'asc' },
      take: 1,
      select: { siteId: true },
    });
    const siteAccesses = await tx.userSiteAccess.findMany({
      where: { tenantId: input.tenantId, userId: user.id },
      orderBy: { createdAt: 'asc' },
      select: { siteId: true },
    });
    const driverProjection = await tx.driver.findFirst({
      where: {
        tenantId: input.tenantId,
        OR: [
          ...(nextUsername ? [{ username: nextUsername }] : []),
          ...(nextEmployeeNo ? [{ employeeNumber: nextEmployeeNo }] : []),
        ],
      },
      select: {
        assignedVehicleId: true,
      },
    });

    const afterSnapshot: SupportUserSnapshot = {
      role: user.role,
      full_name: user.fullName,
      email: user.email,
      username: user.username,
      employee_no: user.employeeNo,
      is_active: user.isActive,
      site_id: siteAssignments[0]?.siteId ?? null,
      site_ids: siteAccesses.map((item) => item.siteId),
      assigned_vehicle_id: driverProjection?.assignedVehicleId ?? null,
    };

    const metadata = {
      user_id: user.id,
      before: beforeSnapshot,
      after: afterSnapshot,
    } as unknown as Prisma.InputJsonValue;

    await tx.auditLog.create({
      data: {
        tenantId: input.tenantId,
        actorId: input.platformUserId,
        actorType: 'PLATFORM',
        eventType: 'PLATFORM_SUPPORT_USER_UPDATED',
        metadata,
      },
    });

    return buildSupportUserRecord(
      {
        id: user.id,
        tenantId: user.tenantId,
        role: user.role,
        fullName: user.fullName,
        email: user.email,
        username: user.username,
        employeeNo: user.employeeNo,
        isActive: user.isActive,
        createdAt: user.createdAt,
        siteAssignments,
        siteAccesses,
      },
      driverProjection?.assignedVehicleId ?? null,
    );
  });

  return updated;
}

export async function resetSupportTenantUserAccount(input: {
  tenantId: string;
  userId: string;
  platformUserId: string;
  password: string;
}) {
  await ensureTenantExists(input.tenantId);

  const user = await prisma.user.findFirst({
    where: {
      id: input.userId,
      tenantId: input.tenantId,
    },
    select: {
      id: true,
      tenantId: true,
      username: true,
      employeeNo: true,
    },
  });

  if (!user) {
    throw new AppError(404, 'user_not_found', 'Tenant user was not found.');
  }

  const passwordHash = await hashPassword(input.password);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    await tx.userAuth.upsert({
      where: { userId: user.id },
      update: {
        passwordHash,
        forcePasswordChange: true,
      },
      create: {
        userId: user.id,
        passwordHash,
        forcePasswordChange: true,
      },
    });

    const projection = await tx.driver.findFirst({
      where: {
        tenantId: input.tenantId,
        OR: [
          ...(user.username ? [{ username: user.username }] : []),
          ...(user.employeeNo ? [{ employeeNumber: user.employeeNo }] : []),
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
        actorId: input.platformUserId,
        actorType: 'PLATFORM',
        eventType: 'PLATFORM_SUPPORT_ACCOUNT_RESET',
        metadata: {
          user_id: user.id,
          password_reset: true,
          force_password_change: true,
        },
      },
    });
  });

  return {
    user_id: user.id,
    tenant_id: user.tenantId,
    password_reset: true,
  };
}
