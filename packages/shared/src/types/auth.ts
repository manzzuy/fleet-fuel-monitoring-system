export const platformRoles = ['PLATFORM_OWNER'] as const;
export const userRoles = [
  'TENANT_ADMIN',
  'COMPANY_ADMIN',
  'SUPERVISOR',
  'SITE_SUPERVISOR',
  'SAFETY_OFFICER',
  'TRANSPORT_MANAGER',
  'HEAD_OFFICE_ADMIN',
  'DRIVER',
] as const;
export const actorTypes = ['PLATFORM', 'STAFF', 'DRIVER'] as const;
export const authRoles = [...platformRoles, ...userRoles] as const;

export type PlatformRole = (typeof platformRoles)[number];
export type UserRole = (typeof userRoles)[number];
export type ActorType = (typeof actorTypes)[number];
export type AuthRole = (typeof authRoles)[number];

export interface JwtAccessTokenClaims {
  sub: string;
  tenant_id: string | null;
  role: AuthRole;
  actor_type: ActorType;
  support_mode?: boolean;
  force_password_change?: boolean;
}
