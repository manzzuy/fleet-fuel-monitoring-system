'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import type { DriverDashboardResponse } from '@fleet-fuel/shared';

import { ApiClientError, getDriverDashboard } from '../lib/api';
import { buildDriverTenantLoginPath, driverTokenKey, isForcePasswordChangeToken } from '../lib/session';
import { DriverShell } from './driver-shell';

interface DriverDashboardProps {
  host: string | null;
  subdomain: string | null;
}

export function DriverDashboard({ host, subdomain }: DriverDashboardProps) {
  const router = useRouter();
  const [summary, setSummary] = useState<DriverDashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!host || !subdomain) {
      router.replace('/');
      return;
    }

    const token = window.localStorage.getItem(driverTokenKey(subdomain));
    if (!token) {
      router.replace('/');
      return;
    }
    if (isForcePasswordChangeToken(token)) {
      router.replace('/change-password');
      return;
    }

    setLoading(true);
    setError(null);
    void getDriverDashboard(host, token)
      .then((result) => setSummary(result))
      .catch((caught) => {
        if (caught instanceof ApiClientError) {
          setError(`${caught.message}${caught.requestId ? ` (request_id: ${caught.requestId})` : ''}`);
        } else {
          setError(caught instanceof Error ? caught.message : 'Unable to load driver dashboard.');
        }
      })
      .finally(() => setLoading(false));
  }, [host, router, subdomain]);

  function signOut() {
    if (subdomain) {
      window.localStorage.removeItem(driverTokenKey(subdomain));
    }
    router.replace(buildDriverTenantLoginPath(subdomain));
  }

  return (
    <DriverShell
      onSignOut={signOut}
      subdomain={subdomain ?? 'tenant'}
      subtitle="Daily readiness, assigned context, and quick submit actions."
      title="Driver dashboard"
    >
      <section className="panel">
        {loading ? <p className="status">Loading dashboard...</p> : null}
        {error ? <p className="status error">{error}</p> : null}
        {!loading && !error && summary ? (
          <div className="stack">
            <p>
              <strong>Driver:</strong> {summary.driver.full_name}
            </p>
            <p>
              <strong>Assigned vehicle:</strong>{' '}
              {summary.assignment.vehicle
                ? `${summary.assignment.vehicle.fleet_no} (${summary.assignment.vehicle.plate_no ?? 'no plate'})`
                : 'Not assigned'}
            </p>
            <p>
              <strong>Assigned site:</strong>{' '}
              {summary.assignment.site
                ? `${summary.assignment.site.site_code} - ${summary.assignment.site.site_name}`
                : 'Not assigned'}
            </p>
            <p>
              <strong>Today checklist:</strong>{' '}
              {summary.today.has_submitted_daily_check ? 'Submitted' : 'Pending'}
            </p>
            <p>
              <strong>Fuel entries today:</strong> {summary.today.fuel_entries_count}
            </p>
            <div className="stack" style={{ marginTop: 8 }}>
              <Link className="button" data-testid="driver-open-daily-checklist" href="/daily-checks">
                Open daily checklist
              </Link>
              <Link className="button ghost" data-testid="driver-open-fuel-entry" href="/fuel-entry">
                Open fuel entry
              </Link>
            </div>
          </div>
        ) : null}
      </section>
    </DriverShell>
  );
}
