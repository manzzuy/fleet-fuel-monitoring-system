import { headers } from 'next/headers';

import { TenantDailyCheckDetailsPage } from '../../../components/tenant-daily-check-details-page';
import { resolveTenantHost, resolveTenantSubdomain } from '../../../lib/tenant';

interface DailyCheckDetailPageProps {
  params: {
    id: string;
  };
}

export default function DailyCheckDetailPage({ params }: DailyCheckDetailPageProps) {
  const host = headers().get('host');
  const tenantHost = resolveTenantHost(host);
  const subdomain = resolveTenantSubdomain(host);

  return (
    <main>
      <TenantDailyCheckDetailsPage id={params.id} host={tenantHost} subdomain={subdomain} />
    </main>
  );
}
