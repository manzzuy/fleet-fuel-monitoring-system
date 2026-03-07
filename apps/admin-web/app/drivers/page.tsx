import { headers } from 'next/headers';

import { TenantDriversPage } from '../../components/tenant-drivers-page';
import { resolveTenantHost, resolveTenantSubdomain } from '../../lib/tenant';

export default function DriversPage() {
  const host = headers().get('host');
  const tenantHost = resolveTenantHost(host);
  const subdomain = resolveTenantSubdomain(host);

  return (
    <main>
      <TenantDriversPage host={tenantHost} subdomain={subdomain} />
    </main>
  );
}
