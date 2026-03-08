import { headers } from 'next/headers';

import { TenantSitesPage } from '../../components/tenant-sites-page';
import { resolveTenantHost, resolveTenantSubdomain } from '../../lib/tenant';

export default function SitesPage() {
  const requestHeaders = headers();
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
  const tenantHost = resolveTenantHost(host);
  const subdomain = resolveTenantSubdomain(host);

  return (
    <main>
      <TenantSitesPage host={tenantHost} subdomain={subdomain} />
    </main>
  );
}
