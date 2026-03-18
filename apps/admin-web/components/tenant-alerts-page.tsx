'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import type {
  DashboardAlertsResponse,
  DriverLookupRecord,
  ScopeStatus,
  SiteLookupRecord,
  VehicleLookupRecord,
} from '@fleet-fuel/shared';

import {
  ApiClientError,
  getTenantDashboardAlerts,
  listTenantDrivers,
  listTenantSites,
  listTenantVehicles,
} from '../lib/api';
import { formatFleetCode, formatSiteDisplayName } from '../lib/display-format';
import { getTenantTokenKey } from '../lib/tenant-session';
import { ScopeEmptyState } from './scope-empty-state';
import { TenantSidebarLayout } from './tenant-sidebar-layout';

interface TenantAlertsPageProps {
  host: string | null;
  subdomain: string | null;
}

const severityOrder = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
} as const;

function toPrettyAlertType(value: string) {
  return value.replaceAll('_', ' ');
}

export function TenantAlertsPage({ host, subdomain }: TenantAlertsPageProps) {
  const router = useRouter();
  const [response, setResponse] = useState<DashboardAlertsResponse | null>(null);
  const [vehicles, setVehicles] = useState<VehicleLookupRecord[]>([]);
  const [drivers, setDrivers] = useState<DriverLookupRecord[]>([]);
  const [sites, setSites] = useState<SiteLookupRecord[]>([]);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [severity, setSeverity] = useState('');
  const [alertType, setAlertType] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [siteId, setSiteId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scopeStatus, setScopeStatus] = useState<ScopeStatus>('full_tenant_scope');

  async function refresh(currentHost: string, accessToken: string) {
    const [alerts, vehiclesResult, driversResult, sitesResult] = await Promise.all([
      getTenantDashboardAlerts(currentHost, accessToken, {
        date,
        severity: severity || undefined,
        alert_type: alertType || undefined,
        vehicle_id: vehicleId || undefined,
        driver_id: driverId || undefined,
        site_id: siteId || undefined,
      }),
      listTenantVehicles(currentHost, accessToken, { limit: '100' }),
      listTenantDrivers(currentHost, accessToken, { limit: '100' }),
      listTenantSites(currentHost, accessToken, { limit: '100' }),
    ]);

    setResponse(alerts);
    setVehicles(vehiclesResult.items);
    setDrivers(driversResult.items);
    setSites(sitesResult.items);
    setScopeStatus(alerts.scope_status ?? 'full_tenant_scope');
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

    setLoading(true);
    setError(null);
    void refresh(host, token)
      .catch((caught) => {
        if (caught instanceof ApiClientError) {
          setError(`${caught.message}${caught.requestId ? ` (request_id: ${caught.requestId})` : ''}`);
          return;
        }
        setError(caught instanceof Error ? caught.message : 'Unable to load exceptions and alerts.');
      })
      .finally(() => setLoading(false));
  }, [alertType, date, driverId, host, router, severity, siteId, subdomain, vehicleId]);

  const sortedItems = useMemo(() => {
    if (!response) {
      return [];
    }

    return [...response.items].sort((left, right) => {
      if (left.occurred_at === right.occurred_at) {
        return severityOrder[right.severity] - severityOrder[left.severity];
      }
      return right.occurred_at.localeCompare(left.occurred_at);
    });
  }, [response]);

  function handleLogout() {
    if (subdomain) {
      window.localStorage.removeItem(getTenantTokenKey(subdomain));
    }
    router.replace('/');
  }

  return (
    <TenantSidebarLayout
      subdomain={subdomain ?? 'tenant'}
      title="Exceptions and alerts"
      description="Rule-based operational exceptions to highlight urgent attention areas."
      onSignOut={handleLogout}
    >
      <section className="kpi-grid four">
        <article className="card kpi-card" data-testid="alerts-summary-missing-checks">
          <h3>Missing checks</h3>
          <p className="kpi-value">{response?.summary.vehicles_missing_daily_check ?? 0}</p>
        </article>
        <article className="card kpi-card" data-testid="alerts-summary-checklist-issues">
          <h3>Checklist issues</h3>
          <p className="kpi-value">{response?.summary.checklist_issues_today ?? 0}</p>
        </article>
        <article className="card kpi-card" data-testid="alerts-summary-fuel-today">
          <h3>Fuel entries today</h3>
          <p className="kpi-value">{response?.summary.fuel_entries_today ?? 0}</p>
        </article>
        <article className="card kpi-card" data-testid="alerts-summary-high-priority">
          <h3>High priority</h3>
          <p className="kpi-value">{response?.summary.high_priority_exceptions ?? 0}</p>
        </article>
      </section>

      {scopeStatus === 'no_site_scope_assigned' ? <ScopeEmptyState /> : null}

      <section className="card" data-testid="alerts-monitoring-module">
        <div className="toolbar">
          <h2>Exceptions table</h2>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => {
              setSeverity('');
              setAlertType('');
              setVehicleId('');
              setDriverId('');
              setSiteId('');
              setDate(new Date().toISOString().slice(0, 10));
            }}
          >
            Reset filters
          </button>
        </div>

        <div className="inline-grid four">
          <label className="field">
            <span>Date</span>
            <input
              data-testid="alerts-filter-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          <label className="field">
            <span>Severity</span>
            <select
              data-testid="alerts-filter-severity"
              value={severity}
              onChange={(event) => setSeverity(event.target.value)}
            >
              <option value="">All severities</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </label>
          <label className="field">
            <span>Alert type</span>
            <select
              data-testid="alerts-filter-type"
              value={alertType}
              onChange={(event) => setAlertType(event.target.value)}
            >
              <option value="">All types</option>
              <option value="missing_daily_check">Missing daily check</option>
              <option value="checklist_issue_reported">Checklist issue</option>
              <option value="critical_checklist_issue">Critical checklist issue</option>
              <option value="repeated_checklist_issues_vehicle">Repeated vehicle checklist issues</option>
              <option value="driver_frequent_skips">Driver frequent skips</option>
              <option value="compliance_expiring_soon">Compliance expiring soon</option>
              <option value="compliance_expired">Compliance expired</option>
              <option value="fuel_missing_receipt">Fuel missing receipt</option>
              <option value="fuel_used_odometer_fallback">Odometer fallback</option>
              <option value="fuel_used_approved_source">Approved source used</option>
              <option value="suspicious_high_liters">Suspicious high liters</option>
              <option value="suspicious_high_liters_vs_distance">High liters vs distance</option>
              <option value="suspicious_repeat_fuel">Suspicious repeat fuel</option>
              <option value="fueling_too_soon_after_previous_fill">Fueling too soon</option>
              <option value="suspicious_consumption_deviation">Consumption deviation</option>
              <option value="suspicious_high_risk_combination">High-risk combination</option>
            </select>
          </label>
          <label className="field">
            <span>Vehicle</span>
            <select
              data-testid="alerts-filter-vehicle"
              value={vehicleId}
              onChange={(event) => setVehicleId(event.target.value)}
            >
              <option value="">All vehicles</option>
              {vehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {formatFleetCode(vehicle.fleet_no)} {vehicle.plate_no ? `(${formatFleetCode(vehicle.plate_no)})` : ''}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="inline-grid three">
          <label className="field">
            <span>Driver</span>
            <select
              data-testid="alerts-filter-driver"
              value={driverId}
              onChange={(event) => setDriverId(event.target.value)}
            >
              <option value="">All drivers</option>
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.full_name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Site</span>
            <select data-testid="alerts-filter-site" value={siteId} onChange={(event) => setSiteId(event.target.value)}>
              <option value="">All sites</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {formatSiteDisplayName(site)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {loading ? <p className="status">Loading exceptions and alerts...</p> : null}
        {error ? <p className="status error">{error}</p> : null}
        {!loading && !error && response && sortedItems.length === 0 ? (
          <p className="status" data-testid="alerts-empty-state">
            No exceptions matched the selected filters.
          </p>
        ) : null}
        {!loading && !error && sortedItems.length > 0 ? (
          <div className="table">
            <div className="table-row table-head alerts-table-row">
              <span>Time</span>
              <span>Alert type</span>
              <span>Severity</span>
              <span>Vehicle</span>
              <span>Driver</span>
              <span>Site</span>
              <span>Reason</span>
              <span>Action</span>
            </div>
            {sortedItems.map((item) => (
              <div className="table-row alerts-table-row" data-testid="alerts-row" key={item.id}>
                <span>{new Date(item.occurred_at).toLocaleString()}</span>
                <span>{toPrettyAlertType(item.alert_type)}</span>
                <span>
                  <span className={`severity-pill severity-${item.severity.toLowerCase()}`}>{item.severity}</span>
                </span>
                <span>{item.vehicle?.fleet_no ? formatFleetCode(item.vehicle.fleet_no) : '—'}</span>
                <span>{item.driver?.full_name ?? '—'}</span>
                <span>{item.site ? formatSiteDisplayName(item.site) : '—'}</span>
                <span>{item.reason}</span>
                <span>
                  <Link href={item.action.target}>{item.action.label}</Link>
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </TenantSidebarLayout>
  );
}
