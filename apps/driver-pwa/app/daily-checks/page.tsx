import { headers } from 'next/headers';

import { DriverDailyCheck } from '../../components/driver-daily-check';
import { resolveTenantHost, resolveTenantSubdomain } from '../../lib/tenant';

interface DriverDailyChecksPageProps {
  searchParams?: {
    tenant?: string | string[];
  };
}

export default function DriverDailyChecksPage({ searchParams }: DriverDailyChecksPageProps) {
  const requestHeaders = headers();
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
  const tenantOverride = searchParams?.tenant;
  const tenantHost = resolveTenantHost(host, tenantOverride);
  const subdomain = resolveTenantSubdomain(host, tenantOverride);

  return <DriverDailyCheck host={tenantHost} subdomain={subdomain} />;
}
