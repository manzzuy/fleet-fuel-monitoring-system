import { headers } from 'next/headers';

import { DriverFuelEntry } from '../../components/driver-fuel-entry';
import { resolveTenantHost, resolveTenantSubdomain } from '../../lib/tenant';

interface DriverFuelEntryPageProps {
  searchParams?: {
    tenant?: string | string[];
  };
}

export default function DriverFuelEntryPage({ searchParams }: DriverFuelEntryPageProps) {
  const requestHeaders = headers();
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
  const tenantOverride = searchParams?.tenant;
  const tenantHost = resolveTenantHost(host, tenantOverride);
  const subdomain = resolveTenantSubdomain(host, tenantOverride);

  return <DriverFuelEntry host={tenantHost} subdomain={subdomain} />;
}
