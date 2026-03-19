import type { TenantStaffRole } from './tenant-session';

const MASTER_DATA_WRITE_ROLES: TenantStaffRole[] = [
  'TENANT_ADMIN',
  'TRANSPORT_MANAGER',
  'COMPANY_ADMIN',
  'HEAD_OFFICE_ADMIN',
];

export function canManageMasterDataRole(role: TenantStaffRole | null): boolean {
  if (!role) {
    return false;
  }
  return MASTER_DATA_WRITE_ROLES.includes(role);
}

export function isSiteSupervisorRole(role: TenantStaffRole | null): boolean {
  return role === 'SITE_SUPERVISOR';
}

export function isSafetyOfficerRole(role: TenantStaffRole | null): boolean {
  return role === 'SAFETY_OFFICER';
}

export function canManageUsersRole(role: TenantStaffRole | null): boolean {
  return role === 'TRANSPORT_MANAGER' || role === 'TENANT_ADMIN' || role === 'COMPANY_ADMIN' || role === 'HEAD_OFFICE_ADMIN';
}

const SITE_SUPERVISOR_ALLOWED_PATHS = ['/dashboard', '/alerts', '/daily-checks', '/fuel', '/drivers', '/vehicles'];
const SAFETY_OFFICER_ALLOWED_PATHS = ['/dashboard', '/alerts', '/daily-checks', '/fuel', '/drivers', '/vehicles'];

function isPathAllowed(pathname: string, allowedPaths: string[]) {
  return allowedPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function canAccessTenantAdminPath(role: TenantStaffRole | null, pathname: string): boolean {
  if (!role) {
    return true;
  }

  if (role === 'SITE_SUPERVISOR') {
    return isPathAllowed(pathname, SITE_SUPERVISOR_ALLOWED_PATHS);
  }

  if (role === 'SAFETY_OFFICER') {
    return isPathAllowed(pathname, SAFETY_OFFICER_ALLOWED_PATHS);
  }

  return true;
}

export function formatRoleLabel(role: TenantStaffRole | null): string {
  if (!role) {
    return 'Staff';
  }
  return role
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
