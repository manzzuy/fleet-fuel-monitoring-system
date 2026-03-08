import { headers } from 'next/headers';

import { TenantAlertsPage } from '../../components/tenant-alerts-page';
import { resolveTenantHost, resolveTenantSubdomain } from '../../lib/tenant';

interface AlertsPageProps {
  searchParams?: {
    tenant?: string | string[];
  };
}

export default function AlertsPage({ searchParams }: AlertsPageProps) {
  const requestHeaders = headers();
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
  const tenantOverride = searchParams?.tenant;
  const tenantHost = resolveTenantHost(host, tenantOverride);
  const subdomain = resolveTenantSubdomain(host, tenantOverride);

  return (
    <main>
      <TenantAlertsPage host={tenantHost} subdomain={subdomain} />
    </main>
  );
}
