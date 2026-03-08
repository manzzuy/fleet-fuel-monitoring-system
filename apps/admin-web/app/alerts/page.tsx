import { headers } from 'next/headers';

import { TenantAlertsPage } from '../../components/tenant-alerts-page';
import { resolveTenantHost, resolveTenantSubdomain } from '../../lib/tenant';

export default function AlertsPage() {
  const requestHeaders = headers();
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
  const tenantHost = resolveTenantHost(host);
  const subdomain = resolveTenantSubdomain(host);

  return (
    <main>
      <TenantAlertsPage host={tenantHost} subdomain={subdomain} />
    </main>
  );
}
