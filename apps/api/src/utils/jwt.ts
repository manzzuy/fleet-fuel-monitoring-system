import jwt, { type Secret, type SignOptions } from 'jsonwebtoken';

import type { JwtAccessTokenClaims } from '@fleet-fuel/shared';

import { env } from '../config/env';

export function signAccessToken(payload: JwtAccessTokenClaims): string {
  const options: SignOptions = {};

  if (env.JWT_EXPIRES_IN) {
    options.expiresIn = env.JWT_EXPIRES_IN as NonNullable<SignOptions['expiresIn']>;
  }

  return jwt.sign(payload, env.JWT_SECRET as Secret, options);
}

export function verifyAccessToken(token: string): JwtAccessTokenClaims {
  return jwt.verify(token, env.JWT_SECRET) as JwtAccessTokenClaims;
}
