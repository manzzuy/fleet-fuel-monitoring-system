import { headers } from 'next/headers';

import { TenantTanksPage } from '../../components/tenant-tanks-page';
import { resolveTenantHost, resolveTenantSubdomain } from '../../lib/tenant';

interface TanksPageProps {
  searchParams?: {
    tenant?: string | string[];
  };
}

export default function TanksPage({ searchParams }: TanksPageProps) {
  const requestHeaders = headers();
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
  const tenantOverride = searchParams?.tenant;
  const tenantHost = resolveTenantHost(host, tenantOverride);
  const subdomain = resolveTenantSubdomain(host, tenantOverride);

  return (
    <main>
      <TenantTanksPage host={tenantHost} subdomain={subdomain} />
    </main>
  );
}
