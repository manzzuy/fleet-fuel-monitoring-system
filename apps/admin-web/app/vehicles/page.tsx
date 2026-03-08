import { headers } from 'next/headers';

import { TenantVehiclesPage } from '../../components/tenant-vehicles-page';
import { resolveTenantHost, resolveTenantSubdomain } from '../../lib/tenant';

export default function VehiclesPage() {
  const requestHeaders = headers();
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
  const tenantHost = resolveTenantHost(host);
  const subdomain = resolveTenantSubdomain(host);

  return (
    <main>
      <TenantVehiclesPage host={tenantHost} subdomain={subdomain} />
    </main>
  );
}
