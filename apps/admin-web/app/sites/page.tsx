import { headers } from 'next/headers';

import { TenantSitesPage } from '../../components/tenant-sites-page';
import { resolveTenantHost, resolveTenantSubdomain } from '../../lib/tenant';

interface SitesPageProps {
  searchParams?: {
    tenant?: string | string[];
  };
}

export default function SitesPage({ searchParams }: SitesPageProps) {
  const requestHeaders = headers();
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
  const tenantOverride = searchParams?.tenant;
  const tenantHost = resolveTenantHost(host, tenantOverride);
  const subdomain = resolveTenantSubdomain(host, tenantOverride);

  return (
    <main>
      <TenantSitesPage host={tenantHost} subdomain={subdomain} />
    </main>
  );
}
