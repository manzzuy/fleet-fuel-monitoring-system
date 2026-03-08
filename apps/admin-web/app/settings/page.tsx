import { headers } from 'next/headers';

import { TenantSettingsPage } from '../../components/tenant-settings-page';
import { resolveTenantHost, resolveTenantSubdomain } from '../../lib/tenant';

interface SettingsPageProps {
  searchParams?: {
    tenant?: string | string[];
  };
}

export default function SettingsPage({ searchParams }: SettingsPageProps) {
  const requestHeaders = headers();
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
  const tenantOverride = searchParams?.tenant;
  const tenantHost = resolveTenantHost(host, tenantOverride);
  const subdomain = resolveTenantSubdomain(host, tenantOverride);

  return (
    <main>
      <TenantSettingsPage host={tenantHost} subdomain={subdomain} />
    </main>
  );
}
