import { headers } from 'next/headers';

import { TenantDashboardShell } from '../../components/tenant-dashboard-shell';
import { resolveTenantHost, resolveTenantSubdomain } from '../../lib/tenant';

export default function DashboardPage() {
  const host = headers().get('host');
  const tenantHost = resolveTenantHost(host);
  const subdomain = resolveTenantSubdomain(host);

  return (
    <main>
      <TenantDashboardShell host={tenantHost} subdomain={subdomain} />
    </main>
  );
}
