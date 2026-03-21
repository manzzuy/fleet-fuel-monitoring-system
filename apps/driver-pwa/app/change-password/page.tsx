import { headers } from 'next/headers';

import { DriverChangePassword } from '../../components/driver-change-password';
import { resolveTenantHost, resolveTenantSubdomain } from '../../lib/tenant';

interface DriverChangePasswordPageProps {
  searchParams?: {
    tenant?: string | string[];
  };
}

export default function DriverChangePasswordPage({ searchParams }: DriverChangePasswordPageProps) {
  const requestHeaders = headers();
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
  const tenantOverride = searchParams?.tenant;
  const tenantHost = resolveTenantHost(host, tenantOverride);
  const subdomain = resolveTenantSubdomain(host, tenantOverride);

  return <DriverChangePassword host={tenantHost} subdomain={subdomain} />;
}
