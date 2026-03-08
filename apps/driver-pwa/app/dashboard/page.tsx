import { headers } from 'next/headers';

import { DriverDashboard } from '../../components/driver-dashboard';
import { resolveTenantSubdomain } from '../../lib/tenant';

export default function DriverDashboardPage() {
  const requestHeaders = headers();
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
  const subdomain = resolveTenantSubdomain(host);

  return <DriverDashboard host={host} subdomain={subdomain} />;
}
