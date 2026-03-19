import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const TENANT_QUERY_PARAM = 'tenant';
const TENANT_COOKIE = 'ff_tenant_override';
const TENANT_FORCE_PASSWORD_COOKIE = 'ff_force_password_change';
const TENANT_OVERRIDE_REGEX = /^[a-z0-9-]+$/;
const CHANGE_PASSWORD_PATH = '/change-password';

function normalizeTenant(value: string | null) {
  const candidate = value?.trim().toLowerCase();
  if (!candidate || !TENANT_OVERRIDE_REGEX.test(candidate)) {
    return null;
  }
  return candidate;
}

function extractHostTenant(host: string | null, baseDomain: string) {
  if (!host) {
    return null;
  }

  const normalizedHost = host.toLowerCase().split(':')[0] ?? '';
  if (!normalizedHost.endsWith(`.${baseDomain}`)) {
    return null;
  }

  const suffix = `.${baseDomain}`;
  const subdomain = normalizedHost.slice(0, -suffix.length);
  return subdomain && TENANT_OVERRIDE_REGEX.test(subdomain) ? subdomain : null;
}

export function middleware(request: NextRequest) {
  const tenantFromQuery = normalizeTenant(request.nextUrl.searchParams.get(TENANT_QUERY_PARAM));
  const tenantFromCookie = normalizeTenant(request.cookies.get(TENANT_COOKIE)?.value ?? null);
  const platformBaseDomain = (process.env.NEXT_PUBLIC_PLATFORM_BASE_DOMAIN ?? 'platform.test').toLowerCase();
  const hostTenant = extractHostTenant(request.headers.get('host'), platformBaseDomain);
  const pathname = request.nextUrl.pathname;
  const forcedTenantFromCookie = normalizeTenant(request.cookies.get(TENANT_FORCE_PASSWORD_COOKIE)?.value ?? null);

  if (tenantFromQuery) {
    const response = NextResponse.next();
    response.cookies.set(TENANT_COOKIE, tenantFromQuery, {
      httpOnly: false,
      sameSite: 'lax',
      path: '/',
      secure: request.nextUrl.protocol === 'https:',
    });
    return response;
  }

  if (
    forcedTenantFromCookie &&
    (tenantFromCookie === forcedTenantFromCookie || hostTenant === forcedTenantFromCookie) &&
    pathname !== '/' &&
    pathname !== CHANGE_PASSWORD_PATH &&
    !pathname.startsWith('/_next')
  ) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = CHANGE_PASSWORD_PATH;
    redirectUrl.searchParams.set(TENANT_QUERY_PARAM, forcedTenantFromCookie);
    return NextResponse.redirect(redirectUrl);
  }

  // Keep root path available for Platform Owner console on non-tenant hosts.
  if (pathname !== '/' && !hostTenant && tenantFromCookie) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.searchParams.set(TENANT_QUERY_PARAM, tenantFromCookie);
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next|favicon.ico|robots.txt|sitemap.xml).*)'],
};
