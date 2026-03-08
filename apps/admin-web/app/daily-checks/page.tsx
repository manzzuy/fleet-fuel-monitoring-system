import { headers } from 'next/headers';

import { TenantDailyChecksPage } from '../../components/tenant-daily-checks-page';
import { resolveTenantHost, resolveTenantSubdomain } from '../../lib/tenant';

export default function DailyChecksPage() {
  const requestHeaders = headers();
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
  const tenantHost = resolveTenantHost(host);
  const subdomain = resolveTenantSubdomain(host);

  return (
    <main>
      <TenantDailyChecksPage host={tenantHost} subdomain={subdomain} />
    </main>
  );
}
