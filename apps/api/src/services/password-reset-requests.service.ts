import { randomBytes } from 'node:crypto';

import { Prisma, UserRole } from '@prisma/client';

import { prisma } from '../db/prisma';
import type { AuthContext, DataScopeContext } from '../types/http';
import { AppError } from '../utils/errors';
import { hashPassword } from '../utils/password';

function canManagePasswordResetRequests(role: AuthContext['role']) {
  return role === 'TRANSPORT_MANAGER' || role === 'TENANT_ADMIN';
}

function generateTemporaryPassword() {
  const suffix = randomBytes(9).toString('base64url');
  return `Tmp${suffix}9aA`;
}

function ensureRequestGovernance(auth: AuthContext, scope: DataScopeContext) {
  if (!canManagePasswordResetRequests(auth.role)) {
    throw new AppError(403, 'forbidden_password_reset_requests', 'Your role cannot manage password reset requests.');
  }
  if (!scope.isFullTenantScope) {
    throw new AppError(403, 'forbidden_password_reset_requests', 'Site-scoped users cannot manage password reset requests.');
  }
}

export interface PasswordResetRequestsQuery {
  status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED' | undefined;
  role?: UserRole | undefined;
  site_id?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
}

export async function listPasswordResetRequests(
  tenantId: string,
  auth: AuthContext,
  scope: DataScopeContext,
  query: PasswordResetRequestsQuery,
) {
  ensureRequestGovernance(auth, scope);

  const where: Prisma.PasswordResetRequestWhereInput = {
    tenantId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.role ? { role: query.role } : {}),
    ...(query.from || query.to
      ? {
          requestedAt: {
            ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
            ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999Z`) } : {}),
          },
        }
      : {}),
  };

  if (query.site_id) {
    where.user = {
      siteAssignments: {
        some: {
          siteId: query.site_id,
        },
      },
    };
  }

  const items = await prisma.passwordResetRequest.findMany({
    where,
    orderBy: [{ requestedAt: 'desc' }],
    include: {
      user: {
        select: {
          id: true,
          fullName: true,
          username: true,
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
        },
      },
      reviewedByUser: {
        select: {
          id: true,
          fullName: true,
          username: true,
        },
      },
    },
  });

  return items.map((item) => ({
    id: item.id,
    username_entered: item.usernameEntered,
    status: item.status,
    role: item.role,
    requested_at: item.requestedAt.toISOString(),
    requested_by_ip: item.requestedByIp,
    reviewed_at: item.reviewedAt ? item.reviewedAt.toISOString() : null,
    notes: item.notes ?? null,
    resolved_user: item.user
      ? {
          id: item.user.id,
          full_name: item.user.fullName,
          username: item.user.username,
          role: item.user.role,
          site: item.user.siteAssignments[0]?.site
            ? {
                id: item.user.siteAssignments[0].site.id,
                site_code: item.user.siteAssignments[0].site.siteCode,
                site_name: item.user.siteAssignments[0].site.siteName,
              }
            : null,
        }
      : null,
    reviewed_by: item.reviewedByUser
      ? {
          id: item.reviewedByUser.id,
          full_name: item.reviewedByUser.fullName,
          username: item.reviewedByUser.username,
        }
      : null,
  }));
}

export async function approvePasswordResetRequest(input: {
  tenantId: string;
  requestId: string;
  reviewer: AuthContext;
  scope: DataScopeContext;
  notes?: string | undefined;
}) {
  ensureRequestGovernance(input.reviewer, input.scope);

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  const result = await prisma.$transaction(async (tx) => {
    const request = await tx.passwordResetRequest.findFirst({
      where: { id: input.requestId, tenantId: input.tenantId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            employeeNo: true,
            role: true,
          },
        },
      },
    });

    if (!request) {
      throw new AppError(404, 'password_reset_request_not_found', 'Password reset request not found.');
    }

    if (request.status !== 'PENDING') {
      throw new AppError(400, 'password_reset_request_not_pending', 'Only pending requests can be approved.');
    }

    let targetUser = request.user;
    if (!targetUser) {
      targetUser = await tx.user.findFirst({
        where: {
          tenantId: input.tenantId,
          isActive: true,
          OR: [{ username: request.usernameEntered }, { email: request.usernameEntered }],
        },
        select: {
          id: true,
          username: true,
          employeeNo: true,
          role: true,
        },
      });
    }

    if (!targetUser) {
      throw new AppError(
        400,
        'password_reset_request_no_matching_user',
        'No active user matches this reset request. Reject it with a reason.',
      );
    }

    await tx.user.update({
      where: { id: targetUser.id },
      data: { passwordHash },
    });

    await tx.userAuth.upsert({
      where: { userId: targetUser.id },
      update: {
        passwordHash,
        forcePasswordChange: true,
      },
      create: {
        userId: targetUser.id,
        passwordHash,
        forcePasswordChange: true,
      },
    });

    if (targetUser.username || targetUser.employeeNo) {
      const projection = await tx.driver.findFirst({
        where: {
          tenantId: input.tenantId,
          OR: [
            ...(targetUser.username ? [{ username: targetUser.username }] : []),
            ...(targetUser.employeeNo ? [{ employeeNumber: targetUser.employeeNo }] : []),
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

    const reviewedAt = new Date();
    const updatedRequest = await tx.passwordResetRequest.update({
      where: { id: request.id },
      data: {
        status: 'APPROVED',
        userId: targetUser.id,
        role: targetUser.role,
        reviewedBy: input.reviewer.sub,
        reviewedAt,
        notes: input.notes ?? request.notes,
      },
    });

    await tx.auditLog.create({
      data: {
        tenantId: input.tenantId,
        actorId: input.reviewer.sub,
        actorType: 'STAFF',
        eventType: 'PASSWORD_RESET_REQUEST_APPROVED',
        metadata: {
          request_id: updatedRequest.id,
          target_user_id: targetUser.id,
          target_role: targetUser.role,
          note: input.notes ?? null,
        },
      },
    });

    return {
      requestId: updatedRequest.id,
      userId: targetUser.id,
      username: targetUser.username,
      role: targetUser.role,
      temporaryPassword,
    };
  });

  return {
    request_id: result.requestId,
    user_id: result.userId,
    username: result.username,
    role: result.role,
    force_password_change: true as const,
    temporary_password: result.temporaryPassword,
  };
}

export async function rejectPasswordResetRequest(input: {
  tenantId: string;
  requestId: string;
  reviewer: AuthContext;
  scope: DataScopeContext;
  notes: string;
}) {
  ensureRequestGovernance(input.reviewer, input.scope);
  const note = input.notes.trim();
  if (!note) {
    throw new AppError(400, 'password_reset_reject_reason_required', 'Reject reason is required.');
  }

  const result = await prisma.$transaction(async (tx) => {
    const request = await tx.passwordResetRequest.findFirst({
      where: { id: input.requestId, tenantId: input.tenantId },
      select: { id: true, status: true },
    });

    if (!request) {
      throw new AppError(404, 'password_reset_request_not_found', 'Password reset request not found.');
    }

    if (request.status !== 'PENDING') {
      throw new AppError(400, 'password_reset_request_not_pending', 'Only pending requests can be rejected.');
    }

    const updated = await tx.passwordResetRequest.update({
      where: { id: request.id },
      data: {
        status: 'REJECTED',
        reviewedBy: input.reviewer.sub,
        reviewedAt: new Date(),
        notes: note,
      },
    });

    await tx.auditLog.create({
      data: {
        tenantId: input.tenantId,
        actorId: input.reviewer.sub,
        actorType: 'STAFF',
        eventType: 'PASSWORD_RESET_REQUEST_REJECTED',
        metadata: {
          request_id: updated.id,
          note,
        },
      },
    });

    return updated;
  });

  return {
    id: result.id,
    status: result.status,
    notes: result.notes ?? null,
    reviewed_at: result.reviewedAt ? result.reviewedAt.toISOString() : null,
  };
}
