import { headers } from 'next/headers';

import { TenantFuelPage } from '../../components/tenant-fuel-page';
import { resolveTenantHost, resolveTenantSubdomain } from '../../lib/tenant';

interface FuelPageProps {
  searchParams?: {
    tenant?: string | string[];
  };
}

export default function FuelPage({ searchParams }: FuelPageProps) {
  const requestHeaders = headers();
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
  const tenantOverride = searchParams?.tenant;
  const tenantHost = resolveTenantHost(host, tenantOverride);
  const subdomain = resolveTenantSubdomain(host, tenantOverride);

  return (
    <main>
      <TenantFuelPage host={tenantHost} subdomain={subdomain} />
    </main>
  );
}
