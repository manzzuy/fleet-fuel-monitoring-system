import { headers } from 'next/headers';

import { TenantDriversPage } from '../../components/tenant-drivers-page';
import { resolveTenantHost, resolveTenantSubdomain } from '../../lib/tenant';

interface DriversPageProps {
  searchParams?: {
    tenant?: string | string[];
  };
}

export default function DriversPage({ searchParams }: DriversPageProps) {
  const requestHeaders = headers();
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
  const tenantOverride = searchParams?.tenant;
  const tenantHost = resolveTenantHost(host, tenantOverride);
  const subdomain = resolveTenantSubdomain(host, tenantOverride);

  return (
    <main>
      <TenantDriversPage host={tenantHost} subdomain={subdomain} />
    </main>
  );
}
