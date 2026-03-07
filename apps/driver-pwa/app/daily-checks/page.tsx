import { headers } from 'next/headers';

import { DriverDailyCheck } from '../../components/driver-daily-check';
import { resolveTenantSubdomain } from '../../lib/tenant';

export default function DriverDailyChecksPage() {
  const host = headers().get('host');
  const subdomain = resolveTenantSubdomain(host);

  return <DriverDailyCheck host={host} subdomain={subdomain} />;
}
