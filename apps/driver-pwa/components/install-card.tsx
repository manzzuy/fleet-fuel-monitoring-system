import type { TenantedHealthResponse } from '@fleet-fuel/shared';

interface InstallCardProps {
  subdomain: string | null;
  health: TenantedHealthResponse | undefined;
  error: string | undefined;
}

export function InstallCard({ subdomain, health, error }: InstallCardProps) {
  return (
    <section className="panel">
      <h2>Driver shell</h2>
      <p>
        PWA scaffolding is enabled. Install prompts depend on your browser and whether you open the app
        as a secure origin or trusted localhost session.
      </p>
      <ul>
        <li>Tenant: {subdomain ?? 'tenant host not detected'}</li>
        <li>Tenant ID: {health?.tenant_id ?? 'unavailable'}</li>
        <li>API request ID: {health?.request_id ?? 'unavailable'}</li>
        {error ? <li>Bootstrap note: {error}</li> : null}
      </ul>
    </section>
  );
}
