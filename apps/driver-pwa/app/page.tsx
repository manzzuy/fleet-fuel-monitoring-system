import { headers } from 'next/headers';

import { DriverLogin } from '../components/driver-login';
import { resolveTenantSubdomain } from '../lib/tenant';

export default async function DriverHomePage() {
  const requestHeaders = headers();
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
  const subdomain = resolveTenantSubdomain(host);

  return (
    <DriverLogin
      host={host}
      subdomain={subdomain}
    />
  );
}
