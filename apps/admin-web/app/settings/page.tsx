import { headers } from 'next/headers';

import { TenantSettingsPage } from '../../components/tenant-settings-page';
import { resolveTenantHost, resolveTenantSubdomain } from '../../lib/tenant';

export default function SettingsPage() {
  const requestHeaders = headers();
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
  const tenantHost = resolveTenantHost(host);
  const subdomain = resolveTenantSubdomain(host);

  return (
    <main>
      <TenantSettingsPage host={tenantHost} subdomain={subdomain} />
    </main>
  );
}
