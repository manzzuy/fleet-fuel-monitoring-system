import { headers } from 'next/headers';

import { PlatformConsole } from '../components/platform-console';
import { TenantLoginPanel } from '../components/tenant-login-panel';
import { resolveTenantHost, resolveTenantSubdomain } from '../lib/tenant';

interface AdminHomePageProps {
  searchParams?: {
    tenant?: string | string[];
  };
}

export default function AdminHomePage({ searchParams }: AdminHomePageProps) {
  const requestHeaders = headers();
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
  const tenantOverride = searchParams?.tenant;
  const tenantHost = resolveTenantHost(host, tenantOverride);
  const subdomain = resolveTenantSubdomain(host, tenantOverride);

  return (
    <main>
      {subdomain && tenantHost ? (
        <TenantLoginPanel host={tenantHost} subdomain={subdomain} />
      ) : (
        <PlatformConsole />
      )}
    </main>
  );
}
