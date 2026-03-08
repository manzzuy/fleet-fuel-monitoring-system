import { headers } from 'next/headers';

import { DriverFuelEntry } from '../../components/driver-fuel-entry';
import { resolveTenantSubdomain } from '../../lib/tenant';

export default function DriverFuelEntryPage() {
  const requestHeaders = headers();
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
  const subdomain = resolveTenantSubdomain(host);

  return <DriverFuelEntry host={host} subdomain={subdomain} />;
}
