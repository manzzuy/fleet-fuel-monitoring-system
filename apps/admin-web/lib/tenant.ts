import { extractTenantSubdomain, normalizeHost } from '@fleet-fuel/shared';

import { appConfig } from './config';

export function resolveTenantHost(host: string | null | undefined) {
  return normalizeHost(host);
}

export function resolveTenantSubdomain(host: string | null | undefined) {
  return extractTenantSubdomain(resolveTenantHost(host), appConfig.platformBaseDomain);
}

export function buildTenantAdminUrl(subdomain: string) {
  return `http://${subdomain}.${appConfig.platformBaseDomain}:3000`;
}
