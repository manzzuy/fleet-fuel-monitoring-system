import { headers } from 'next/headers';

import { TenantDailyChecksPage } from '../../components/tenant-daily-checks-page';
import { resolveTenantHost, resolveTenantSubdomain } from '../../lib/tenant';

interface DailyChecksPageProps {
  searchParams?: {
    tenant?: string | string[];
  };
}

export default function DailyChecksPage({ searchParams }: DailyChecksPageProps) {
  const requestHeaders = headers();
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
  const tenantOverride = searchParams?.tenant;
  const tenantHost = resolveTenantHost(host, tenantOverride);
  const subdomain = resolveTenantSubdomain(host, tenantOverride);

  return (
    <main>
      <TenantDailyChecksPage host={tenantHost} subdomain={subdomain} />
    </main>
  );
}
