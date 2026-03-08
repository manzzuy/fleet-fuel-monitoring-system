import { headers } from 'next/headers';

import { DriverLogin } from '../components/driver-login';
import { resolveTenantHost, resolveTenantSubdomain } from '../lib/tenant';

interface DriverHomePageProps {
  searchParams?: {
    tenant?: string | string[];
  };
}

export default async function DriverHomePage({ searchParams }: DriverHomePageProps) {
  const requestHeaders = headers();
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
  const tenantOverride = searchParams?.tenant;
  const tenantHost = resolveTenantHost(host, tenantOverride);
  const subdomain = resolveTenantSubdomain(host, tenantOverride);

  return (
    <DriverLogin
      host={tenantHost}
      subdomain={subdomain}
    />
  );
}
