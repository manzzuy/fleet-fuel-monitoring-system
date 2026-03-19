'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { ScopeStatus, TenantDashboardSummaryResponse } from '@fleet-fuel/shared';

import { ApiClientError, getTenantDashboardSummary } from '../lib/api';
import { formatFleetCode } from '../lib/display-format';
import { getTenantRoleFromToken, getTenantTokenKey, type TenantStaffRole } from '../lib/tenant-session';
import { ScopeEmptyState } from './scope-empty-state';
import { TenantSidebarLayout } from './tenant-sidebar-layout';

interface TenantDashboardShellProps {
  host: string | null;
  subdomain: string | null;
}

function formatDate(value?: string | null) {
  if (!value) {
    return 'Not available';
  }
  return new Date(value).toLocaleString();
}

function formatAlertType(value: string) {
  return value.replaceAll('_', ' ');
}

function SummarySkeleton() {
  return (
    <>
      <section className="card">
        <div className="skeleton skeleton-title" />
        <div className="skeleton skeleton-subtitle" />
      </section>
      <section className="kpi-grid five">
        {Array.from({ length: 5 }).map((_, index) => (
          <article className="card" key={index}>
            <div className="skeleton skeleton-kpi-label" />
            <div className="skeleton skeleton-kpi-value" />
          </article>
        ))}
      </section>
      <section className="dashboard-grid">
        <div className="card">
          <div className="skeleton skeleton-title" />
          <div className="skeleton skeleton-block" />
        </div>
        <div className="card">
          <div className="skeleton skeleton-title" />
          <div className="skeleton skeleton-block" />
        </div>
      </section>
    </>
  );
}

export function TenantDashboardShell({ host, subdomain }: TenantDashboardShellProps) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [summary, setSummary] = useState<TenantDashboardSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorRequestId, setErrorRequestId] = useState<string | null>(null);
  const [scopeStatus, setScopeStatus] = useState<ScopeStatus>('full_tenant_scope');
  const [role, setRole] = useState<TenantStaffRole | null>(null);

  async function loadDashboardSummary(currentHost: string, token: string) {
    setLoading(true);
    setError(null);
    setErrorRequestId(null);

    try {
      const response = await getTenantDashboardSummary(currentHost, token);
      setSummary(response);
      setScopeStatus(response.scope_status ?? 'full_tenant_scope');
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        setError(caught.message);
        setErrorRequestId(caught.requestId ?? null);
      } else {
        setError(caught instanceof Error ? caught.message : 'Unable to load dashboard.');
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!host || !subdomain) {
      router.replace('/');
      return;
    }

    const token = window.localStorage.getItem(getTenantTokenKey(subdomain));
    if (!token) {
      router.replace('/');
      return;
    }

    setRole(getTenantRoleFromToken(token));
    setAuthorized(true);
    void loadDashboardSummary(host, token);
  }, [host, router, subdomain]);

  function handleLogout() {
    if (subdomain) {
      window.localStorage.removeItem(getTenantTokenKey(subdomain));
    }
    setRole(null);
    router.replace('/');
  }

  function handleRetry() {
    if (!host || !subdomain) {
      return;
    }

    const token = window.localStorage.getItem(getTenantTokenKey(subdomain));
    if (!token) {
      router.replace('/');
      return;
    }

    void loadDashboardSummary(host, token);
  }

  if (!authorized) {
    return (
      <section className="card">
        <h2>Redirecting</h2>
        <p>Authentication is required before accessing the operations dashboard.</p>
      </section>
    );
  }

  if (loading) {
    return <SummarySkeleton />;
  }

  if (error || !summary) {
    return (
      <section className="card">
        <h2>Dashboard unavailable</h2>
        <p className="status error">{error ?? 'Unable to load dashboard summary.'}</p>
        {errorRequestId ? (
          <p className="status">
            Request ID: <code>{errorRequestId}</code>
          </p>
        ) : null}
        <div className="toolbar">
          <button className="button" onClick={handleRetry} type="button">
            Retry
          </button>
          <button className="button button-secondary" onClick={handleLogout} type="button">
            Sign out
          </button>
        </div>
      </section>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const onboardingBatch = summary.onboarding.last_batch;
  const allAlerts = summary.recent.alerts ?? [];
  const monitoringSummary = summary.monitoring_summary ?? {
    vehicles_missing_daily_check: summary.daily_checks_today.pending_count,
    high_risk_fuel_alerts: 0,
    compliance_expired: 0,
    compliance_expiring_soon: 0,
    receipt_gaps: 0,
    checklist_issues_today: 0,
    fuel_entries_today: summary.fuel_entries_recent.length,
    fuel_missing_receipt: 0,
    fuel_odometer_fallback: 0,
    approved_source_usage: 0,
    high_priority_exceptions: 0,
    total_alerts: allAlerts.length,
  };
  const noImportedData =
    summary.kpis.sites_total === 0 &&
    summary.kpis.vehicles_total === 0 &&
    summary.kpis.drivers_total === 0 &&
    summary.kpis.fuel_cards_total === 0;
  const needsAttention = allAlerts
    .filter((item) =>
      [
        'suspicious_consumption_deviation',
        'suspicious_high_liters',
        'suspicious_high_liters_vs_distance',
        'suspicious_repeat_fuel',
        'fueling_too_soon_after_previous_fill',
        'suspicious_high_risk_combination',
        'missing_daily_check',
        'critical_checklist_issue',
        'compliance_expired',
      ].includes(item.alert_type),
    )
    .slice(0, 8);
  const complianceWatchlist = allAlerts
    .filter((item) => item.alert_type === 'compliance_expired' || item.alert_type === 'compliance_expiring_soon')
    .slice(0, 8);
  const latestFuelExceptions = allAlerts
    .filter((item) =>
      [
        'fuel_missing_receipt',
        'fuel_used_odometer_fallback',
        'fuel_used_approved_source',
        'suspicious_consumption_deviation',
        'suspicious_high_liters',
        'suspicious_high_liters_vs_distance',
        'suspicious_repeat_fuel',
        'fueling_too_soon_after_previous_fill',
        'suspicious_high_risk_combination',
      ].includes(item.alert_type),
    )
    .slice(0, 5);
  const latestChecklistIssues = allAlerts
    .filter((item) =>
      [
        'missing_daily_check',
        'checklist_issue_reported',
        'critical_checklist_issue',
        'repeated_checklist_issues_vehicle',
        'driver_frequent_skips',
      ].includes(item.alert_type),
    )
    .slice(0, 5);
  const latestComplianceUpdates = allAlerts
    .filter((item) => item.alert_type === 'compliance_expired' || item.alert_type === 'compliance_expiring_soon')
    .slice(0, 5);
  const complianceDriversExpired = complianceWatchlist.filter(
    (item) => item.alert_type === 'compliance_expired' && item.driver,
  ).length;
  const complianceDriversExpiring = complianceWatchlist.filter(
    (item) => item.alert_type === 'compliance_expiring_soon' && item.driver,
  ).length;
  const complianceVehiclesExpired = complianceWatchlist.filter(
    (item) => item.alert_type === 'compliance_expired' && item.vehicle,
  ).length;
  const complianceVehiclesExpiring = complianceWatchlist.filter(
    (item) => item.alert_type === 'compliance_expiring_soon' && item.vehicle,
  ).length;

  return (
    <TenantSidebarLayout
      subdomain={summary.tenant.subdomain}
      role={role}
      title={`${summary.tenant.subdomain} operations`}
      description="Operational overview for immediate supervisor actions."
      onSignOut={handleLogout}
    >
      <section className="card" data-testid="dashboard-shell">
        <p className="status">
          Last onboarding activity:{' '}
          <strong>{onboardingBatch ? formatDate(onboardingBatch.created_at) : 'No onboarding batches yet'}</strong>
        </p>
      </section>

      {scopeStatus === 'no_site_scope_assigned' ? <ScopeEmptyState /> : null}

      <section className="kpi-grid five" data-testid="dashboard-kpi-row">
        <article className="card kpi-card kpi-card-animated" style={{ animationDelay: '0ms' }}>
          <h3>📋 Missing Daily Checks</h3>
          <p className="kpi-value">{monitoringSummary.vehicles_missing_daily_check}</p>
          <small className="status">
            <Link href={`/daily-checks?date=${today}&skip_only=true`}>Open Daily Checks</Link>
          </small>
        </article>
        <article className="card kpi-card kpi-card-animated" style={{ animationDelay: '50ms' }}>
          <h3>⛽ High-Risk Fuel Alerts</h3>
          <p className="kpi-value">{monitoringSummary.high_risk_fuel_alerts}</p>
          <small className="status">
            <Link href={`/alerts?date=${today}&alert_type=suspicious_high_risk_combination`}>Open Alerts</Link>
          </small>
        </article>
        <article className="card kpi-card kpi-card-animated" style={{ animationDelay: '100ms' }}>
          <h3>🧾 Compliance Expired</h3>
          <p className="kpi-value">{monitoringSummary.compliance_expired}</p>
          <small className="status">
            <Link href={`/alerts?date=${today}&alert_type=compliance_expired`}>Open Compliance Alerts</Link>
          </small>
        </article>
        <article className="card kpi-card kpi-card-animated" style={{ animationDelay: '150ms' }}>
          <h3>⏳ Compliance Expiring Soon</h3>
          <p className="kpi-value">{monitoringSummary.compliance_expiring_soon}</p>
          <small className="status">
            <Link href={`/alerts?date=${today}&alert_type=compliance_expiring_soon`}>Open Compliance Alerts</Link>
          </small>
        </article>
        <article className="card kpi-card kpi-card-animated" style={{ animationDelay: '200ms' }}>
          <h3>🧩 Receipt Gaps</h3>
          <p className="kpi-value">{monitoringSummary.receipt_gaps}</p>
          <small className="status">
            <Link href={`/fuel?from=${today}&to=${today}&missing_receipt_only=true`}>Open Fuel</Link>
          </small>
        </article>
      </section>

      {noImportedData ? (
        <section className="card">
          <h2>No operational data yet</h2>
          <p>Import the onboarding workbook from platform administration to populate sites, drivers, vehicles, and cards.</p>
          <p className="status">
            Open <code>http://localhost:3000</code> as platform owner and run onboarding import for this operation.
          </p>
        </section>
      ) : null}

      <section className="dashboard-grid" data-testid="dashboard-monitoring-summary">
        <section className="card" data-testid="dashboard-needs-attention">
          <h2>Needs Attention</h2>
          {needsAttention.length === 0 ? (
            <p className="status" data-testid="dashboard-needs-attention-empty">
              No urgent needs-review items for today.
            </p>
          ) : (
            <div className="table" data-testid="dashboard-needs-attention-list">
              <div className="table-row table-head dashboard-alert-row">
                <span>Time</span>
                <span>Type</span>
                <span>Vehicle</span>
                <span>Reason</span>
                <span>Action</span>
              </div>
              {needsAttention.map((item) => (
                <div className="table-row dashboard-alert-row" key={item.id}>
                  <span>{new Date(item.occurred_at).toLocaleTimeString()}</span>
                  <span>{formatAlertType(item.alert_type)}</span>
                  <span>{item.vehicle?.fleet_no ? formatFleetCode(item.vehicle.fleet_no) : '—'}</span>
                  <span>{item.reason}</span>
                  <span>
                    <Link href={item.action.target}>{item.action.label}</Link>
                  </span>
                </div>
              ))}
            </div>
          )}
          <p className="status">
            <Link href={`/alerts?severity=HIGH&date=${today}`}>Open high-priority alerts</Link>
          </p>
        </section>

        <section className="card" data-testid="dashboard-compliance-watchlist">
          <h2>Compliance Watchlist</h2>
          <div className="kpi-grid four compact">
            <article className="inset-card">
              <h3>Drivers Expired</h3>
              <p className="kpi-value small">{complianceDriversExpired}</p>
            </article>
            <article className="inset-card">
              <h3>Drivers Expiring</h3>
              <p className="kpi-value small">{complianceDriversExpiring}</p>
            </article>
            <article className="inset-card">
              <h3>Vehicles Expired</h3>
              <p className="kpi-value small">{complianceVehiclesExpired}</p>
            </article>
            <article className="inset-card">
              <h3>Vehicles Expiring</h3>
              <p className="kpi-value small">{complianceVehiclesExpiring}</p>
            </article>
          </div>
          {complianceWatchlist.length === 0 ? (
            <p className="status">No compliance expiry alerts for this scope.</p>
          ) : (
            <div className="table">
              <div className="table-row table-head dashboard-watchlist-row">
                <span>Type</span>
                <span>Target</span>
                <span>Reason</span>
                <span>Action</span>
              </div>
              {complianceWatchlist.map((item) => (
                <div className="table-row dashboard-watchlist-row" key={item.id}>
                  <span>{item.alert_type === 'compliance_expired' ? 'Expired' : 'Expiring soon'}</span>
                  <span>{item.driver?.full_name ?? (item.vehicle?.fleet_no ? formatFleetCode(item.vehicle.fleet_no) : '—')}</span>
                  <span>{item.reason}</span>
                  <span>
                    <Link href={item.action.target}>{item.action.label}</Link>
                  </span>
                </div>
              ))}
            </div>
          )}
          <p className="status">
            <Link href={`/alerts?date=${today}&alert_type=compliance_expired`}>Open compliance alerts</Link>
          </p>
        </section>
      </section>

      <section className="kpi-grid three" data-testid="dashboard-compact-sections">
        <section className="card">
          <h2>Latest Fuel Exceptions</h2>
          {latestFuelExceptions.length === 0 ? (
            <p className="status">No fuel exceptions in current scope.</p>
          ) : (
            <div className="table">
              <div className="table-row table-head dashboard-compact-row">
                <span>Type</span>
                <span>Vehicle</span>
                <span>Action</span>
              </div>
              {latestFuelExceptions.map((item) => (
                <div className="table-row dashboard-compact-row" key={item.id}>
                  <span>{formatAlertType(item.alert_type)}</span>
                  <span>{item.vehicle?.fleet_no ? formatFleetCode(item.vehicle.fleet_no) : '—'}</span>
                  <span>
                    <Link href={item.action.target}>{item.action.label}</Link>
                  </span>
                </div>
              ))}
            </div>
          )}
          <p className="status">
            <Link href={`/fuel?from=${today}&to=${today}`}>Open fuel monitoring</Link>
          </p>
        </section>

        <section className="card">
          <h2>Latest Checklist Issues</h2>
          {latestChecklistIssues.length === 0 ? (
            <p className="status">No checklist issues in current scope.</p>
          ) : (
            <div className="table">
              <div className="table-row table-head dashboard-compact-row">
                <span>Type</span>
                <span>Vehicle</span>
                <span>Action</span>
              </div>
              {latestChecklistIssues.map((item) => (
                <div className="table-row dashboard-compact-row" key={item.id}>
                  <span>{formatAlertType(item.alert_type)}</span>
                  <span>{item.vehicle?.fleet_no ? formatFleetCode(item.vehicle.fleet_no) : '—'}</span>
                  <span>
                    <Link href={item.action.target}>{item.action.label}</Link>
                  </span>
                </div>
              ))}
            </div>
          )}
          <p className="status">
            <Link href={`/daily-checks?date=${today}&issue_only=true`}>Open daily checks monitoring</Link>
          </p>
        </section>

        <section className="card">
          <h2>Latest Compliance Updates</h2>
          {latestComplianceUpdates.length === 0 ? (
            <p className="status">No compliance updates in current scope.</p>
          ) : (
            <div className="table">
              <div className="table-row table-head dashboard-compact-row">
                <span>Status</span>
                <span>Target</span>
                <span>Action</span>
              </div>
              {latestComplianceUpdates.map((item) => (
                <div className="table-row dashboard-compact-row" key={item.id}>
                  <span>{item.alert_type === 'compliance_expired' ? 'Expired' : 'Expiring soon'}</span>
                  <span>{item.driver?.full_name ?? (item.vehicle?.fleet_no ? formatFleetCode(item.vehicle.fleet_no) : '—')}</span>
                  <span>
                    <Link href={item.action.target}>{item.action.label}</Link>
                  </span>
                </div>
              ))}
            </div>
          )}
          <p className="status">
            <Link href={`/alerts?date=${today}&alert_type=compliance_expiring_soon`}>Open compliance monitoring</Link>
          </p>
        </section>
      </section>

      <section className="card">
        <h2>Onboarding status</h2>
        {onboardingBatch ? (
          <dl>
            <div>
              <dt>Last batch ID</dt>
              <dd>{onboardingBatch.id}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{onboardingBatch.status}</dd>
            </div>
            <div>
              <dt>Created at</dt>
              <dd>{formatDate(onboardingBatch.created_at)}</dd>
            </div>
            <div>
              <dt>Imported counts</dt>
              <dd>
                Sites {onboardingBatch.counts.sites}, Drivers {onboardingBatch.counts.drivers}, Vehicles{' '}
                {onboardingBatch.counts.vehicles}, Fuel Cards {onboardingBatch.counts.fuel_cards}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="status">No onboarding batches yet.</p>
        )}
      </section>
    </TenantSidebarLayout>
  );
}
