import { headers } from 'next/headers';

import { TenantFuelPage } from '../../components/tenant-fuel-page';
import { resolveTenantHost, resolveTenantSubdomain } from '../../lib/tenant';

export default function FuelPage() {
  const requestHeaders = headers();
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
  const tenantHost = resolveTenantHost(host);
  const subdomain = resolveTenantSubdomain(host);

  return (
    <main>
      <TenantFuelPage host={tenantHost} subdomain={subdomain} />
    </main>
  );
}
