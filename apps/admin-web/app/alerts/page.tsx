import { headers } from 'next/headers';

import { TenantAlertsPage } from '../../components/tenant-alerts-page';
import { resolveTenantHost, resolveTenantSubdomain } from '../../lib/tenant';

export default function AlertsPage() {
  const host = headers().get('host');
  const tenantHost = resolveTenantHost(host);
  const subdomain = resolveTenantSubdomain(host);

  return (
    <main>
      <TenantAlertsPage host={tenantHost} subdomain={subdomain} />
    </main>
  );
}
