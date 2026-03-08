import { headers } from 'next/headers';

import { TenantTanksPage } from '../../components/tenant-tanks-page';
import { resolveTenantHost, resolveTenantSubdomain } from '../../lib/tenant';

export default function TanksPage() {
  const requestHeaders = headers();
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
  const tenantHost = resolveTenantHost(host);
  const subdomain = resolveTenantSubdomain(host);

  return (
    <main>
      <TenantTanksPage host={tenantHost} subdomain={subdomain} />
    </main>
  );
}
