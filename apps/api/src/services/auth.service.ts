import type { TenantLoginRequest, TenantLoginResponse } from '@fleet-fuel/shared';
import type { TenantContext } from '../types/http';
import { UserRole } from '@prisma/client';

import { prisma } from '../db/prisma';
import { AppError } from '../utils/errors';
import { signAccessToken } from '../utils/jwt';
import { verifyPassword } from '../utils/password';

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

  const actorType = user.role === UserRole.DRIVER ? 'DRIVER' : 'STAFF';

  return {
    access_token: signAccessToken({
      sub: user.id,
      tenant_id: tenant.id,
      role: user.role,
      actor_type: actorType,
    }),
    token_type: 'Bearer',
    expires_in: '15m',
    tenant_id: tenant.id,
    role: user.role,
    actor_type: actorType,
  };
}
