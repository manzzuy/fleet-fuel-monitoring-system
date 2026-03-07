import { headers } from 'next/headers';

import { TenantSitesPage } from '../../components/tenant-sites-page';
import { resolveTenantHost, resolveTenantSubdomain } from '../../lib/tenant';

export default function SitesPage() {
  const host = headers().get('host');
  const tenantHost = resolveTenantHost(host);
  const subdomain = resolveTenantSubdomain(host);

  return (
    <main>
      <TenantSitesPage host={tenantHost} subdomain={subdomain} />
    </main>
  );
}
