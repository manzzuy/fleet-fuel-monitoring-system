import { headers } from 'next/headers';

import { TenantDailyChecksPage } from '../../components/tenant-daily-checks-page';
import { resolveTenantHost, resolveTenantSubdomain } from '../../lib/tenant';

export default function DailyChecksPage() {
  const host = headers().get('host');
  const tenantHost = resolveTenantHost(host);
  const subdomain = resolveTenantSubdomain(host);

  return (
    <main>
      <TenantDailyChecksPage host={tenantHost} subdomain={subdomain} />
    </main>
  );
}
