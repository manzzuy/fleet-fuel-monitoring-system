export function getTenantTokenKey(subdomain: string) {
  return `tenant_staff_access_token:${subdomain}`;
}

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

export function getTenantRole(subdomain: string): TenantStaffRole | null {
  const token = getTenantAccessToken(subdomain);
  if (!token) {
    return null;
  }
  return getTenantRoleFromToken(token);
}
