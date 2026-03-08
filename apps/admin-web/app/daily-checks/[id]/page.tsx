import { headers } from 'next/headers';

import { TenantDailyCheckDetailsPage } from '../../../components/tenant-daily-check-details-page';
import { resolveTenantHost, resolveTenantSubdomain } from '../../../lib/tenant';

interface DailyCheckDetailPageProps {
  params: {
    id: string;
  };
  searchParams?: {
    tenant?: string | string[];
  };
}

export default function DailyCheckDetailPage({ params, searchParams }: DailyCheckDetailPageProps) {
  const requestHeaders = headers();
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
  const tenantOverride = searchParams?.tenant;
  const tenantHost = resolveTenantHost(host, tenantOverride);
  const subdomain = resolveTenantSubdomain(host, tenantOverride);

  return (
    <main>
      <TenantDailyCheckDetailsPage id={params.id} host={tenantHost} subdomain={subdomain} />
    </main>
  );
}
