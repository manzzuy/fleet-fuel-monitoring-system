import { headers } from 'next/headers';

import { TenantDashboardShell } from '../../components/tenant-dashboard-shell';
import { resolveTenantHost, resolveTenantSubdomain } from '../../lib/tenant';

export default function DashboardPage() {
  const requestHeaders = headers();
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
  const tenantHost = resolveTenantHost(host);
  const subdomain = resolveTenantSubdomain(host);

  return (
    <main>
      <TenantDashboardShell host={tenantHost} subdomain={subdomain} />
    </main>
  );
}
