import type {
  TenantChangePasswordRequest,
  TenantChangePasswordResponse,
  TenantLoginRequest,
  TenantLoginResponse,
} from '@fleet-fuel/shared';
import type { TenantContext } from '../types/http';
import { UserRole } from '@prisma/client';

import { prisma } from '../db/prisma';
import { AppError } from '../utils/errors';
import { signAccessToken } from '../utils/jwt';
import { hashPassword, verifyPassword } from '../utils/password';

export async function loginTenantStaff(
  tenant: TenantContext,
  payload: TenantLoginRequest,
): Promise<TenantLoginResponse> {
  const identifier = payload.identifier.trim();

  const user = await prisma.user.findFirst({
    where: {
      tenantId: tenant.id,
      isActive: true,
      OR: [{ email: identifier.toLowerCase() }, { username: identifier.toLowerCase() }],
    },
  });

  if (!user) {
    throw new AppError(401, 'invalid_credentials', 'Invalid credentials.');
  }

  const valid = await verifyPassword(user.passwordHash, payload.password);

  if (!valid) {
    throw new AppError(401, 'invalid_credentials', 'Invalid credentials.');
  }

  const userAuth = await prisma.userAuth.findUnique({
    where: { userId: user.id },
    select: { forcePasswordChange: true },
  });
  const forcePasswordChange = userAuth?.forcePasswordChange ?? false;

  if (user.role === UserRole.SITE_SUPERVISOR || user.role === UserRole.SAFETY_OFFICER || user.role === UserRole.DRIVER) {
    const [accessSitesCount, assignedSitesCount, legacyAssignedSitesCount] = await Promise.all([
      prisma.userSiteAccess.count({
        where: {
          tenantId: tenant.id,
          userId: user.id,
        },
      }),
      prisma.userSiteAssignment.count({
        where: {
          tenantId: tenant.id,
          userId: user.id,
        },
      }),
      prisma.supervisorSite.count({
        where: {
          tenantId: tenant.id,
          supervisorUserId: user.id,
        },
      }),
    ]);
    const totalSites = accessSitesCount + assignedSitesCount + legacyAssignedSitesCount;

    if (totalSites === 0) {
      throw new AppError(
        403,
        'site_scope_required',
        'This account must be assigned to at least one site before sign in.',
      );
    }

    if ((user.role === UserRole.SITE_SUPERVISOR || user.role === UserRole.DRIVER) && totalSites !== 1) {
      throw new AppError(
        403,
        'single_site_scope_required',
        'This role must be assigned to exactly one site before sign in.',
      );
    }
  }

  const actorType = user.role === UserRole.DRIVER ? 'DRIVER' : 'STAFF';

  return {
    access_token: signAccessToken({
      sub: user.id,
      tenant_id: tenant.id,
      role: user.role,
      actor_type: actorType,
      force_password_change: forcePasswordChange,
    }),
    token_type: 'Bearer',
    expires_in: '15m',
    tenant_id: tenant.id,
    role: user.role,
    actor_type: actorType,
    force_password_change: forcePasswordChange,
  };
}

export async function changeTenantStaffPassword(
  tenant: TenantContext,
  authUserId: string,
  payload: TenantChangePasswordRequest,
): Promise<TenantChangePasswordResponse> {
  const user = await prisma.user.findFirst({
    where: {
      id: authUserId,
      tenantId: tenant.id,
      isActive: true,
    },
    select: {
      id: true,
      tenantId: true,
      role: true,
      username: true,
      employeeNo: true,
      passwordHash: true,
    },
  });

  if (!user) {
    throw new AppError(404, 'user_not_found', 'User account not found.');
  }

  const valid = await verifyPassword(user.passwordHash, payload.current_password);
  if (!valid) {
    throw new AppError(401, 'invalid_credentials', 'Current password is incorrect.');
  }

  const passwordHash = await hashPassword(payload.new_password);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    await tx.userAuth.upsert({
      where: { userId: user.id },
      update: {
        passwordHash,
        forcePasswordChange: false,
      },
      create: {
        userId: user.id,
        passwordHash,
        forcePasswordChange: false,
      },
    });

    if (user.username || user.employeeNo) {
      const projection = await tx.driver.findFirst({
        where: {
          tenantId: tenant.id,
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
    }
  });

  const actorType = user.role === UserRole.DRIVER ? 'DRIVER' : 'STAFF';
  return {
    access_token: signAccessToken({
      sub: user.id,
      tenant_id: tenant.id,
      role: user.role,
      actor_type: actorType,
      force_password_change: false,
    }),
    token_type: 'Bearer',
    expires_in: '15m',
    tenant_id: tenant.id,
    role: user.role,
    actor_type: actorType,
    force_password_change: false,
  };
}
