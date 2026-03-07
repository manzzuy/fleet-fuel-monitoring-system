import type { PlatformLoginRequest, PlatformLoginResponse } from '@fleet-fuel/shared';

import { prisma } from '../db/prisma';
import { AppError } from '../utils/errors';
import { signAccessToken } from '../utils/jwt';
import { verifyPassword } from '../utils/password';

export async function loginPlatformOwner(
  payload: PlatformLoginRequest,
): Promise<PlatformLoginResponse> {
  const user = await prisma.platformUser.findUnique({
    where: {
      email: payload.email.trim().toLowerCase(),
    },
  });

  if (!user) {
    throw new AppError(401, 'invalid_credentials', 'Invalid credentials.');
  }

  const valid = await verifyPassword(user.passwordHash, payload.password);

  if (!valid) {
    throw new AppError(401, 'invalid_credentials', 'Invalid credentials.');
  }

  const accessToken = signAccessToken({
    sub: user.id,
    tenant_id: null,
    role: user.role,
    actor_type: 'PLATFORM',
  });

  return {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: '15m',
    tenant_id: null,
    role: 'PLATFORM_OWNER',
    actor_type: 'PLATFORM',
  };
}
