import { headers } from 'next/headers';

import { TenantVehiclesPage } from '../../components/tenant-vehicles-page';
import { resolveTenantHost, resolveTenantSubdomain } from '../../lib/tenant';

interface VehiclesPageProps {
  searchParams?: {
    tenant?: string | string[];
  };
}

export default function VehiclesPage({ searchParams }: VehiclesPageProps) {
  const requestHeaders = headers();
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
  const tenantOverride = searchParams?.tenant;
  const tenantHost = resolveTenantHost(host, tenantOverride);
  const subdomain = resolveTenantSubdomain(host, tenantOverride);

  return (
    <main>
      <TenantVehiclesPage host={tenantHost} subdomain={subdomain} />
    </main>
  );
}
