import { headers } from 'next/headers';

import { TenantDriversPage } from '../../components/tenant-drivers-page';
import { resolveTenantHost, resolveTenantSubdomain } from '../../lib/tenant';

export default function DriversPage() {
  const requestHeaders = headers();
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
  const tenantHost = resolveTenantHost(host);
  const subdomain = resolveTenantSubdomain(host);

  return (
    <main>
      <TenantDriversPage host={tenantHost} subdomain={subdomain} />
    </main>
  );
}
