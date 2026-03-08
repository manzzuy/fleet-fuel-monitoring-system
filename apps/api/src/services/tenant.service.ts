import type { TenantContext } from '../types/http';
import type { Request } from 'express';

import { extractTenantSubdomain, normalizeHost } from '@fleet-fuel/shared';

import { env } from '../config/env';
import { prisma } from '../db/prisma';

export function getEffectiveHost(host: string | null | undefined, forwardedHost?: string | string[]) {
  const forwarded = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost;
  return normalizeHost(forwarded ?? host);
}

const TENANT_OVERRIDE_REGEX = /^[a-z0-9-]+$/;

function normalizeTenantOverride(value: unknown) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string') {
    return null;
  }

  const normalized = raw.trim().toLowerCase();
  if (!normalized || !TENANT_OVERRIDE_REGEX.test(normalized)) {
    return null;
  }

  return normalized;
}

export function resolveTenant(request: Pick<Request, 'headers' | 'query'>) {
  const queryTenant = normalizeTenantOverride(request.query?.tenant);
  if (queryTenant) {
    return queryTenant;
  }

  const host = getEffectiveHost(request.headers.host, request.headers['x-forwarded-host']);
  return extractTenantSubdomain(host, env.PLATFORM_BASE_DOMAIN);
}

export async function resolveTenantFromSubdomain(subdomain: string | null | undefined): Promise<TenantContext | null> {
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

export async function resolveTenantFromHost(host: string | null | undefined): Promise<TenantContext | null> {
  const subdomain = extractTenantSubdomain(host, env.PLATFORM_BASE_DOMAIN);
  return resolveTenantFromSubdomain(subdomain);
}
