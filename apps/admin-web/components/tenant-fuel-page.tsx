'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from 'next/navigation';

import type {
  DashboardAlertRecord,
  DriverLookupRecord,
  FuelEntriesListResponse,
  VehicleLookupRecord,
} from '@fleet-fuel/shared';
import type { SiteLookupRecord } from '@fleet-fuel/shared';
import type { ScopeStatus } from '@fleet-fuel/shared';

import {
  ApiClientError,
  getTenantDashboardAlerts,
  listFuelLogs,
  listTenantDrivers,
  listTenantSites,
  listTenantVehicles,
} from '../lib/api';
import { formatFleetCode, formatSiteDisplayName } from '../lib/display-format';
import { getTenantRoleFromToken, getTenantTokenKey, type TenantStaffRole } from '../lib/tenant-session';
import { ScopeEmptyState } from './scope-empty-state';
import { TenantSidebarLayout } from './tenant-sidebar-layout';

interface TenantFuelPageProps {
  host: string | null;
  subdomain: string | null;
}

export function TenantFuelPage({ host, subdomain }: TenantFuelPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [entries, setEntries] = useState<FuelEntriesListResponse['items']>([]);
  const [anomalyByRecordId, setAnomalyByRecordId] = useState<Map<string, DashboardAlertRecord>>(new Map());
  const [vehicles, setVehicles] = useState<VehicleLookupRecord[]>([]);
  const [drivers, setDrivers] = useState<DriverLookupRecord[]>([]);
  const [sites, setSites] = useState<SiteLookupRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scopeStatus, setScopeStatus] = useState<ScopeStatus>('full_tenant_scope');
  const [role, setRole] = useState<TenantStaffRole | null>(null);
  const [vehicleId, setVehicleId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [sourceType, setSourceType] = useState<
    'ALL' | 'CARD' | 'TANK' | 'STATION' | 'MANUAL' | 'APPROVED_SOURCE'
  >('ALL');
  const [siteId, setSiteId] = useState('');
  const [missingReceiptOnly, setMissingReceiptOnly] = useState(false);
  const [fallbackUsed, setFallbackUsed] = useState<'ALL' | 'true' | 'false'>('ALL');
  const [relatedRecordId, setRelatedRecordId] = useState('');

  useEffect(() => {
    const vehicle = searchParams.get('vehicle_id') ?? '';
    const driver = searchParams.get('driver_id') ?? '';
    const from = searchParams.get('from') ?? '';
    const to = searchParams.get('to') ?? '';
    const source = searchParams.get('source_type');
    const site = searchParams.get('site_id') ?? '';
    const missingReceipt = searchParams.get('missing_receipt_only');
    const fallback = searchParams.get('fallback_used');
    const related = searchParams.get('related_record_id') ?? '';

    setVehicleId(vehicle);
    setDriverId(driver);
    setFromDate(from);
    setToDate(to);
    setSourceType(
      source === 'CARD' || source === 'TANK' || source === 'STATION' || source === 'MANUAL' || source === 'APPROVED_SOURCE'
        ? source
        : 'ALL',
    );
    setSiteId(site);
    setMissingReceiptOnly(missingReceipt === 'true');
    setFallbackUsed(fallback === 'true' || fallback === 'false' ? fallback : 'ALL');
    setRelatedRecordId(related);
  }, [searchParams]);

  async function refresh(currentHost: string, accessToken: string) {
    const activeDate = toDate || fromDate || new Date().toISOString().slice(0, 10);
    const [fuelResult, vehiclesResult, driversResult, sitesResult, alertsResult] = await Promise.all([
      listFuelLogs(currentHost, accessToken, {
        limit: '50',
        vehicle_id: vehicleId || undefined,
        driver_id: driverId || undefined,
        from: fromDate || undefined,
        to: toDate || undefined,
        source_type: sourceType === 'ALL' ? undefined : sourceType,
        site_id: siteId || undefined,
        missing_receipt_only: missingReceiptOnly ? 'true' : undefined,
        fallback_used: fallbackUsed === 'ALL' ? undefined : fallbackUsed,
        related_record_id: relatedRecordId || undefined,
      }),
      listTenantVehicles(currentHost, accessToken, { limit: '100' }),
      listTenantDrivers(currentHost, accessToken, { limit: '100' }),
      listTenantSites(currentHost, accessToken, { limit: '100' }),
      getTenantDashboardAlerts(currentHost, accessToken, {
        date: activeDate,
      }),
    ]);

    setEntries(fuelResult.items);
    setVehicles(vehiclesResult.items);
    setDrivers(driversResult.items);
    setSites(sitesResult.items);
    setScopeStatus(fuelResult.scope_status ?? 'full_tenant_scope');
    const anomalyTypes = new Set([
      'suspicious_high_liters_vs_distance',
      'suspicious_consumption_deviation',
      'fueling_too_soon_after_previous_fill',
      'suspicious_high_risk_combination',
    ]);
    const mapped = new Map<string, DashboardAlertRecord>();
    for (const item of alertsResult.items) {
      if (!item.related_record_id || !anomalyTypes.has(item.alert_type)) {
        continue;
      }
      if (!mapped.has(item.related_record_id)) {
        mapped.set(item.related_record_id, item);
      }
    }
    setAnomalyByRecordId(mapped);
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
    setLoading(true);
    setError(null);
    void refresh(host, token)
      .catch((caught) => {
        if (caught instanceof ApiClientError) {
          const message =
            caught.code === 'route_not_found'
              ? 'Fuel log endpoint is unavailable in the current API runtime. Restart the API server and retry.'
              : caught.message;
          setError(`${message}${caught.requestId ? ` (request_id: ${caught.requestId})` : ''}`);
          return;
        }
        setError(caught instanceof Error ? caught.message : 'Unable to load fuel logs.');
      })
      .finally(() => setLoading(false));
  }, [
    driverId,
    fallbackUsed,
    fromDate,
    host,
    missingReceiptOnly,
    relatedRecordId,
    router,
    siteId,
    sourceType,
    subdomain,
    toDate,
    vehicleId,
  ]);

  const summary = useMemo(() => {
    const totalLiters = entries.reduce((sum, entry) => sum + Number(entry.liters), 0);
    const anomalyCount = entries.filter((entry) => anomalyByRecordId.has(entry.id)).length;
    const vehiclesCount = new Set(entries.map((entry) => entry.vehicle.id)).size;

    return {
      rows: entries.length,
      liters: totalLiters.toFixed(2),
      anomalies: anomalyCount,
      vehicles: vehiclesCount,
    };
  }, [anomalyByRecordId, entries]);

  function handleLogout() {
    if (subdomain) {
      window.localStorage.removeItem(getTenantTokenKey(subdomain));
    }
    setRole(null);
    router.replace('/');
  }

  return (
    <TenantSidebarLayout
      subdomain={subdomain ?? 'tenant'}
      role={role}
      title="Fuel monitoring"
      description="Fuel log monitoring, filters, and anomaly indicators."
      onSignOut={handleLogout}
    >
      <section className="kpi-grid four">
        <article className="card kpi-card">
          <h3>Rows</h3>
          <p className="kpi-value">{summary.rows}</p>
        </article>
        <article className="card kpi-card">
          <h3>Liters</h3>
          <p className="kpi-value">{summary.liters}</p>
        </article>
        <article className="card kpi-card">
          <h3>Vehicles</h3>
          <p className="kpi-value">{summary.vehicles}</p>
        </article>
        <article className="card kpi-card">
          <h3>Anomalies</h3>
          <p className="kpi-value">{summary.anomalies}</p>
        </article>
      </section>

      {scopeStatus === 'no_site_scope_assigned' ? <ScopeEmptyState /> : null}

      <section className="card" data-testid="fuel-monitoring-module">
        <div className="toolbar">
          <h2>Fuel logs</h2>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => {
              setVehicleId('');
              setDriverId('');
              setFromDate('');
              setToDate('');
              setSourceType('ALL');
              setSiteId('');
              setMissingReceiptOnly(false);
              setFallbackUsed('ALL');
              setRelatedRecordId('');
            }}
          >
            Clear filters
          </button>
        </div>
        <div className="inline-grid four filter-grid">
          <label className="field">
            <span>Vehicle</span>
            <select value={vehicleId} onChange={(event) => setVehicleId(event.target.value)}>
              <option value="">All vehicles</option>
              {vehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {formatFleetCode(vehicle.fleet_no)} {vehicle.plate_no ? `(${formatFleetCode(vehicle.plate_no)})` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Driver</span>
            <select value={driverId} onChange={(event) => setDriverId(event.target.value)}>
              <option value="">All drivers</option>
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.full_name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>From</span>
            <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
          </label>
          <label className="field">
            <span>To</span>
            <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
          </label>
        </div>
        <div className="inline-grid four filter-grid">
          <label className="field">
            <span>Site</span>
            <select value={siteId} onChange={(event) => setSiteId(event.target.value)}>
              <option value="">All sites</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {formatSiteDisplayName(site)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Source type</span>
            <select value={sourceType} onChange={(event) => setSourceType(event.target.value as typeof sourceType)}>
              <option value="ALL">All</option>
              <option value="MANUAL">Manual</option>
              <option value="CARD">Card</option>
              <option value="TANK">Tank</option>
              <option value="STATION">Station</option>
              <option value="APPROVED_SOURCE">Approved source</option>
            </select>
          </label>
          <label className="field">
            <span>Fallback used</span>
            <select value={fallbackUsed} onChange={(event) => setFallbackUsed(event.target.value as typeof fallbackUsed)}>
              <option value="ALL">All</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </label>
          <label className="checkbox-field">
            <input
              checked={missingReceiptOnly}
              onChange={(event) => setMissingReceiptOnly(event.target.checked)}
              type="checkbox"
            />
            <span>Missing receipt only</span>
          </label>
        </div>
        {relatedRecordId ? (
          <p className="status">
            Focused on record <code>{relatedRecordId}</code>.
          </p>
        ) : null}
        {loading ? <p className="status">Loading fuel logs...</p> : null}
        {error ? <p className="status error">{error}</p> : null}
        {!loading && !error && entries.length === 0 ? (
          <p className="status">
            {relatedRecordId
              ? 'The targeted fuel record is no longer available in your current scope. Showing current filtered results.'
              : 'No fuel logs match this filter set.'}
          </p>
        ) : null}
        {!loading && !error && entries.length > 0 ? (
          <div className="table">
            <div className="table-row table-head fuel-table-row-monitor">
              <span>Date</span>
              <span>Vehicle</span>
              <span>Driver</span>
              <span>Liters</span>
              <span>Odometer</span>
              <span>Source</span>
              <span>Distance km</span>
              <span>Expected L</span>
              <span>Deviation %</span>
              <span>Risk</span>
              <span>Anomaly</span>
            </div>
            {entries.map((entry) => {
              const anomaly = anomalyByRecordId.get(entry.id);
              const details = anomaly?.anomaly_details;
              return (
                <div
                  className={`table-row fuel-table-row-monitor${relatedRecordId === entry.id ? ' row-highlight' : ''}`}
                  key={entry.id}
                >
                  <span>{entry.entry_date}</span>
                  <span>{formatFleetCode(entry.vehicle.fleet_no)}</span>
                  <span>{entry.driver?.full_name ?? '—'}</span>
                  <span>{entry.liters}</span>
                  <span>{entry.odometer_km}</span>
                  <span>{entry.source_type}</span>
                  <span>{details?.distance_km ?? '—'}</span>
                  <span>{typeof details?.expected_liters === 'number' ? details.expected_liters.toFixed(1) : '—'}</span>
                  <span>{typeof details?.deviation_pct === 'number' ? `${details.deviation_pct.toFixed(1)}%` : '—'}</span>
                  <span>{typeof details?.risk_score === 'number' ? details.risk_score : '—'}</span>
                  <span>{anomaly ? anomaly.reason : '—'}</span>
                </div>
              );
            })}
          </div>
        ) : null}
      </section>
    </TenantSidebarLayout>
  );
}
