import { headers } from 'next/headers';

import { TenantSettingsPage } from '../../components/tenant-settings-page';
import { resolveTenantHost, resolveTenantSubdomain } from '../../lib/tenant';

export default function SettingsPage() {
  const host = headers().get('host');
  const tenantHost = resolveTenantHost(host);
  const subdomain = resolveTenantSubdomain(host);

  return (
    <main>
      <TenantSettingsPage host={tenantHost} subdomain={subdomain} />
    </main>
  );
}
