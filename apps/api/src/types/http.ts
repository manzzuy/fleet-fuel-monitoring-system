import type { JwtAccessTokenClaims } from '@fleet-fuel/shared';

export interface TenantContext {
  id: string;
  name: string;
  subdomain: string;
  status: string;
}

export type AuthContext = JwtAccessTokenClaims;

export interface DataScopeContext {
  isFullTenantScope: boolean;
  allowedSiteIds: string[];
  scopeStatus: 'full_tenant_scope' | 'site_scope_limited' | 'no_site_scope_assigned';
}
