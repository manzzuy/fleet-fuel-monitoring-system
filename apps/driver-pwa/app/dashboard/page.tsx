import { headers } from 'next/headers';

import { DriverDashboard } from '../../components/driver-dashboard';
import { resolveTenantHost, resolveTenantSubdomain } from '../../lib/tenant';

interface DriverDashboardPageProps {
  searchParams?: {
    tenant?: string | string[];
  };
}

export default function DriverDashboardPage({ searchParams }: DriverDashboardPageProps) {
  const requestHeaders = headers();
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
  const tenantOverride = searchParams?.tenant;
  const tenantHost = resolveTenantHost(host, tenantOverride);
  const subdomain = resolveTenantSubdomain(host, tenantOverride);

  return <DriverDashboard host={tenantHost} subdomain={subdomain} />;
}
