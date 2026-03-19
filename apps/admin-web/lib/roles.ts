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
