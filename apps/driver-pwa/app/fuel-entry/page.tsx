import { headers } from 'next/headers';

import { DriverFuelEntry } from '../../components/driver-fuel-entry';
import { resolveTenantSubdomain } from '../../lib/tenant';

export default function DriverFuelEntryPage() {
  const host = headers().get('host');
  const subdomain = resolveTenantSubdomain(host);

  return <DriverFuelEntry host={host} subdomain={subdomain} />;
}
