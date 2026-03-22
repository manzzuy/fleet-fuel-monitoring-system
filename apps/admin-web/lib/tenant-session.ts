export function getTenantTokenKey(subdomain: string) {
  return `tenant_staff_access_token:${subdomain}`;
}

export const TENANT_FORCE_PASSWORD_COOKIE = 'ff_force_password_change';

export type TenantStaffRole =
  | 'TENANT_ADMIN'
  | 'COMPANY_ADMIN'
  | 'SUPERVISOR'
  | 'SITE_SUPERVISOR'
  | 'SAFETY_OFFICER'
  | 'TRANSPORT_MANAGER'
  | 'HEAD_OFFICE_ADMIN'
  | 'DRIVER';

interface JwtClaims {
  role?: string;
  force_password_change?: boolean;
  full_name?: string;
  username?: string | null;
}

export function getTenantAccessToken(subdomain: string): string | null {
  return window.localStorage.getItem(getTenantTokenKey(subdomain));
}

function decodeClaims(token: string): JwtClaims | null {
  const parts = token.split('.');
  const payloadPart = parts[1];
  if (!payloadPart) {
    return null;
  }

  try {
    const payload = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const normalized = payload.padEnd(Math.ceil(payload.length / 4) * 4, '=');
    const json = window.atob(normalized);
    return JSON.parse(json) as JwtClaims;
  } catch {
    return null;
  }
}

export function getTenantRoleFromToken(token: string): TenantStaffRole | null {
  const claims = decodeClaims(token);
  const role = claims?.role;
  if (
    role === 'TENANT_ADMIN' ||
    role === 'COMPANY_ADMIN' ||
    role === 'SUPERVISOR' ||
    role === 'SITE_SUPERVISOR' ||
    role === 'SAFETY_OFFICER' ||
    role === 'TRANSPORT_MANAGER' ||
    role === 'HEAD_OFFICE_ADMIN' ||
    role === 'DRIVER'
  ) {
    return role;
  }
  return null;
}

export function isForcePasswordChangeToken(token: string): boolean {
  const claims = decodeClaims(token);
  return claims?.force_password_change === true;
}

export function setForcePasswordChangeCookie(subdomain: string, enabled: boolean) {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  if (enabled) {
    document.cookie = `${TENANT_FORCE_PASSWORD_COOKIE}=${encodeURIComponent(subdomain)}; Path=/; SameSite=Lax${secure}`;
    return;
  }
  document.cookie = `${TENANT_FORCE_PASSWORD_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}

export function getTenantRole(subdomain: string): TenantStaffRole | null {
  const token = getTenantAccessToken(subdomain);
  if (!token) {
    return null;
  }
  return getTenantRoleFromToken(token);
}

export function getTenantIdentityFromToken(token: string): { fullName: string | null; username: string | null } {
  const claims = decodeClaims(token);
  const fullName = claims?.full_name?.trim() || null;
  const username = claims?.username?.trim() || null;
  return { fullName, username };
}

export function getTenantDisplayName(subdomain: string): string | null {
  const token = getTenantAccessToken(subdomain);
  if (!token) {
    return null;
  }
  const identity = getTenantIdentityFromToken(token);
  return identity.fullName ?? identity.username ?? null;
}

export function buildTenantLoginPath(subdomain: string | null | undefined): string {
  const normalized = subdomain?.trim();
  if (!normalized) {
    return '/';
  }
  return `/?tenant=${encodeURIComponent(normalized)}`;
}
