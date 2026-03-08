import { extractTenantSubdomain, normalizeHost } from '@fleet-fuel/shared';

import { appConfig } from './config';

const TENANT_OVERRIDE_REGEX = /^[a-z0-9-]+$/;

function normalizeTenantOverride(value: string | string[] | null | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const candidate = raw?.trim().toLowerCase();
  if (!candidate || !TENANT_OVERRIDE_REGEX.test(candidate)) {
    return null;
  }
  return candidate;
}

export function resolveTenant(request: {
  host: string | null | undefined;
  tenant?: string | string[] | null | undefined;
}) {
  const tenant = normalizeTenantOverride(request.tenant);
  const host = normalizeHost(request.host);

  if (tenant) {
    return {
      tenant,
      host: `${tenant}.${appConfig.platformBaseDomain}`,
    };
  }

  const subdomain = extractTenantSubdomain(host, appConfig.platformBaseDomain);
  return {
    tenant: subdomain,
    host,
  };
}

export function resolveTenantHost(host: string | null | undefined, tenant?: string | string[] | null | undefined) {
  return resolveTenant({ host, tenant }).host;
}

export function resolveTenantSubdomain(host: string | null | undefined, tenant?: string | string[] | null | undefined) {
  return resolveTenant({ host, tenant }).tenant;
}

export function buildTenantAdminUrl(subdomain: string) {
  return `http://${subdomain}.${appConfig.platformBaseDomain}:3000`;
}
