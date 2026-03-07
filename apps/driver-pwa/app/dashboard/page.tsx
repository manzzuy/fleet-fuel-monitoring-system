import { headers } from 'next/headers';

import { DriverDashboard } from '../../components/driver-dashboard';
import { resolveTenantSubdomain } from '../../lib/tenant';

export default function DriverDashboardPage() {
  const host = headers().get('host');
  const subdomain = resolveTenantSubdomain(host);

  return <DriverDashboard host={host} subdomain={subdomain} />;
}
