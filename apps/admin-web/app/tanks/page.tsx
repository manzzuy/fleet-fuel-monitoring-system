import { headers } from 'next/headers';

import { TenantTanksPage } from '../../components/tenant-tanks-page';
import { resolveTenantHost, resolveTenantSubdomain } from '../../lib/tenant';

export default function TanksPage() {
  const host = headers().get('host');
  const tenantHost = resolveTenantHost(host);
  const subdomain = resolveTenantSubdomain(host);

  return (
    <main>
      <TenantTanksPage host={tenantHost} subdomain={subdomain} />
    </main>
  );
}
