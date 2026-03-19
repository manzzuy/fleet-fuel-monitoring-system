import type { CreateTenantRequest, PlatformTenantRecord } from '@fleet-fuel/shared';

import { Prisma, UserRole } from '@prisma/client';

import { prisma } from '../db/prisma';
import { AppError } from '../utils/errors';
import { hashPassword } from '../utils/password';

export async function listTenants(): Promise<PlatformTenantRecord[]> {
  const tenants = await prisma.tenant.findMany({
    include: {
      domains: {
        where: {
          isPrimary: true,
        },
        take: 1,
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return tenants.map((tenant) => ({
    id: tenant.id,
    name: tenant.name,
    status: tenant.status,
    primary_subdomain: tenant.domains[0]?.subdomain ?? '',
    created_at: tenant.createdAt.toISOString(),
  }));
}

export async function createTenant(payload: CreateTenantRequest): Promise<PlatformTenantRecord> {
  try {
    const tenant = await prisma.$transaction(async (tx) => {
      const createdTenant = await tx.tenant.create({
        data: {
          name: payload.tenantName.trim(),
          domains: {
            create: {
              subdomain: payload.subdomain,
              isPrimary: true,
            },
          },
        },
        include: {
          domains: {
            where: {
              isPrimary: true,
            },
            take: 1,
          },
        },
      });

      let initialAdmin:
        | {
            id: string;
            email: string | null;
            username: string;
            fullName: string;
            role: 'TRANSPORT_MANAGER';
          }
        | undefined;

      if (payload.createInitialAdmin && payload.initialAdmin) {
        const createdUser = await tx.user.create({
          data: {
            tenantId: createdTenant.id,
            role: UserRole.TRANSPORT_MANAGER,
            email: payload.initialAdmin.email ?? null,
            username: payload.initialAdmin.username,
            fullName: payload.initialAdmin.fullName.trim(),
            passwordHash: await hashPassword(payload.initialAdmin.password),
          },
        });

        initialAdmin = {
          id: createdUser.id,
          email: createdUser.email,
          username: createdUser.username!,
          fullName: createdUser.fullName,
          role: 'TRANSPORT_MANAGER',
        };
      }

      return {
        id: createdTenant.id,
        name: createdTenant.name,
        status: createdTenant.status,
        primary_subdomain: createdTenant.domains[0]!.subdomain,
        created_at: createdTenant.createdAt.toISOString(),
        ...(initialAdmin
          ? {
              initial_admin: {
                id: initialAdmin.id,
                email: initialAdmin.email,
                username: initialAdmin.username,
                full_name: initialAdmin.fullName,
                role: initialAdmin.role,
              },
            }
          : {}),
      };
    });

    return tenant;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const target = Array.isArray(error.meta?.target) ? error.meta.target.join(',') : '';

      if (target.includes('subdomain')) {
        throw new AppError(409, 'subdomain_taken', 'Subdomain is already in use.');
      }

      if (target.includes('email')) {
        throw new AppError(409, 'admin_email_taken', 'Initial admin email is already in use for this tenant.');
      }

      if (target.includes('username')) {
        throw new AppError(
          409,
          'admin_username_taken',
          'Initial admin username is already in use for this tenant.',
        );
      }
    }

    throw error;
  }
}
