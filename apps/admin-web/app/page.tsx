import { headers } from 'next/headers';

import { PlatformConsole } from '../components/platform-console';
import { TenantLoginPanel } from '../components/tenant-login-panel';
import { resolveTenantHost, resolveTenantSubdomain } from '../lib/tenant';

export default function AdminHomePage() {
  const host = headers().get('host');
  const tenantHost = resolveTenantHost(host);
  const subdomain = resolveTenantSubdomain(host);

  return (
    <main>
      {subdomain && tenantHost ? (
        <TenantLoginPanel host={tenantHost} subdomain={subdomain} />
      ) : (
        <PlatformConsole />
      )}
    </main>
  );
}
