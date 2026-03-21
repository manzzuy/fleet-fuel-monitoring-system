import { Prisma } from '@prisma/client';

import { prisma } from '../db/prisma';
import type { AuthContext } from '../types/http';
import { AppError } from '../utils/errors';

export async function getTenantProfile(tenantId: string, userId: string) {
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      tenantId,
      isActive: true,
    },
    select: {
      id: true,
      fullName: true,
      username: true,
      role: true,
      employeeNo: true,
    },
  });

  if (!user) {
    throw new AppError(404, 'user_not_found', 'User account not found.');
  }

  return {
    id: user.id,
    full_name: user.fullName,
    username: user.username,
    role: user.role,
    employee_no: user.employeeNo,
  };
}

export async function updateTenantProfile(input: {
  tenantId: string;
  userId: string;
  auth: AuthContext;
  payload: {
    full_name?: string | undefined;
    username?: string | undefined;
  };
}) {
  const existing = await prisma.user.findFirst({
    where: {
      id: input.userId,
      tenantId: input.tenantId,
      isActive: true,
    },
    select: {
      id: true,
      role: true,
      fullName: true,
      username: true,
      employeeNo: true,
    },
  });

  if (!existing) {
    throw new AppError(404, 'user_not_found', 'User account not found.');
  }

  if (input.auth.sub !== input.userId) {
    throw new AppError(403, 'forbidden_profile_update', 'Users may only update their own profile.');
  }

  const nextFullName =
    input.payload.full_name === undefined ? existing.fullName : input.payload.full_name.trim();
  const nextUsername =
    input.payload.username === undefined
      ? existing.username
      : input.payload.username.trim().toLowerCase();

  if (!nextFullName) {
    throw new AppError(400, 'validation_error', 'full_name cannot be empty.');
  }
  if (!nextUsername) {
    throw new AppError(400, 'validation_error', 'username cannot be empty.');
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.user.update({
        where: { id: existing.id },
        data: {
          fullName: nextFullName,
          username: nextUsername,
        },
        select: {
          id: true,
          fullName: true,
          username: true,
          role: true,
          employeeNo: true,
        },
      });

      if (existing.role === 'DRIVER') {
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
            data: {
              fullName: nextFullName,
              username: nextUsername,
            },
          });
        }
      }

      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          actorId: input.userId,
          actorType: 'STAFF',
          eventType: 'TENANT_PROFILE_UPDATED',
          metadata: {
            user_id: input.userId,
            full_name_changed: existing.fullName !== nextFullName,
            username_changed: existing.username !== nextUsername,
          } as Prisma.InputJsonValue,
        },
      });

      return saved;
    });

    return {
      id: updated.id,
      full_name: updated.fullName,
      username: updated.username,
      role: updated.role,
      employee_no: updated.employeeNo,
    };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new AppError(409, 'username_conflict', 'Username is already in use.');
    }
    throw error;
  }
}
