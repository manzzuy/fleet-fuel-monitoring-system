import { headers } from 'next/headers';

import { TenantDashboardShell } from '../../components/tenant-dashboard-shell';
import { resolveTenantHost, resolveTenantSubdomain } from '../../lib/tenant';

interface DashboardPageProps {
  searchParams?: {
    tenant?: string | string[];
  };
}

export default function DashboardPage({ searchParams }: DashboardPageProps) {
  const requestHeaders = headers();
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
  const tenantOverride = searchParams?.tenant;
  const tenantHost = resolveTenantHost(host, tenantOverride);
  const subdomain = resolveTenantSubdomain(host, tenantOverride);

  return (
    <main>
      <TenantDashboardShell host={tenantHost} subdomain={subdomain} />
    </main>
  );
}
