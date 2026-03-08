import { headers } from 'next/headers';

import { PlatformConsole } from '../components/platform-console';
import { TenantLoginPanel } from '../components/tenant-login-panel';
import { resolveTenantHost, resolveTenantSubdomain } from '../lib/tenant';

export default function AdminHomePage() {
  const requestHeaders = headers();
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
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
