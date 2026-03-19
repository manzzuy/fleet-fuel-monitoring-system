import { headers } from 'next/headers';

import { TenantChangePasswordPanel } from '../../components/tenant-change-password-panel';
import { resolveTenantHost, resolveTenantSubdomain } from '../../lib/tenant';

interface ChangePasswordPageProps {
  searchParams?: {
    tenant?: string | string[];
  };
}

export default function ChangePasswordPage({ searchParams }: ChangePasswordPageProps) {
  const requestHeaders = headers();
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
  const tenantOverride = searchParams?.tenant;
  const tenantHost = resolveTenantHost(host, tenantOverride);
  const subdomain = resolveTenantSubdomain(host, tenantOverride);

  return (
    <main>
      {subdomain && tenantHost ? (
        <TenantChangePasswordPanel host={tenantHost} subdomain={subdomain} />
      ) : (
        <section className="card">
          <h2>Tenant context required</h2>
          <p>Open this page with a valid tenant host or tenant query parameter.</p>
        </section>
      )}
    </main>
  );
}
