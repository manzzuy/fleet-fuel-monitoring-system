import { headers } from 'next/headers';

import { TenantVehiclesPage } from '../../components/tenant-vehicles-page';
import { resolveTenantHost, resolveTenantSubdomain } from '../../lib/tenant';

export default function VehiclesPage() {
  const host = headers().get('host');
  const tenantHost = resolveTenantHost(host);
  const subdomain = resolveTenantSubdomain(host);

  return (
    <main>
      <TenantVehiclesPage host={tenantHost} subdomain={subdomain} />
    </main>
  );
}
