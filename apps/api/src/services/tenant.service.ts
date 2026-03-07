import type { TenantContext } from '../types/http';

import { extractTenantSubdomain, normalizeHost } from '@fleet-fuel/shared';

import { env } from '../config/env';
import { prisma } from '../db/prisma';

export function getEffectiveHost(host: string | null | undefined, forwardedHost?: string | string[]) {
  const forwarded = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost;
  return normalizeHost(forwarded ?? host);
}

export async function resolveTenantFromHost(host: string | null | undefined): Promise<TenantContext | null> {
  const subdomain = extractTenantSubdomain(host, env.PLATFORM_BASE_DOMAIN);

  if (!subdomain) {
    return null;
  }

  const domain = await prisma.tenantDomain.findUnique({
    where: {
      subdomain,
    },
    include: {
      tenant: true,
    },
  });

  if (!domain) {
    return null;
  }

  return {
    id: domain.tenant.id,
    name: domain.tenant.name,
    status: domain.tenant.status,
    subdomain: domain.subdomain,
  };
}
