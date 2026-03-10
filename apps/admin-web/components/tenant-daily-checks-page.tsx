'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import type { DailyChecksListResponse, DriverLookupRecord, VehicleLookupRecord } from '@fleet-fuel/shared';
import type { SiteLookupRecord } from '@fleet-fuel/shared';
import type { ScopeStatus } from '@fleet-fuel/shared';

import { ApiClientError, listDailyChecks, listTenantDrivers, listTenantSites, listTenantVehicles } from '../lib/api';
import { getTenantTokenKey } from '../lib/tenant-session';
import { ScopeEmptyState } from './scope-empty-state';
import { TenantSidebarLayout } from './tenant-sidebar-layout';

interface TenantDailyChecksPageProps {
  host: string | null;
  subdomain: string | null;
}

function checkStatusLabel(status: 'DRAFT' | 'SUBMITTED') {
  return status === 'SUBMITTED' ? '🟢 Submitted' : '🟡 Pending';
}

function issueLabelText(status: 'DRAFT' | 'SUBMITTED', notOkCount: number) {
  if (notOkCount > 0) {
    return `🔴 ${notOkCount} issues`;
  }
  if (status === 'DRAFT') {
    return '🟠 Missing submission';
  }
  return '🟢 Clear';
}

export function TenantDailyChecksPage({ host, subdomain }: TenantDailyChecksPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'DRAFT' | 'SUBMITTED'>('ALL');
  const [vehicleId, setVehicleId] = useState('');
  const [siteId, setSiteId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [skipOnly, setSkipOnly] = useState(false);
  const [issueOnly, setIssueOnly] = useState(false);
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [repeatedOnly, setRepeatedOnly] = useState(false);
  const [relatedRecordId, setRelatedRecordId] = useState('');
  const [checks, setChecks] = useState<DailyChecksListResponse['items']>([]);
  const [vehicles, setVehicles] = useState<VehicleLookupRecord[]>([]);
  const [drivers, setDrivers] = useState<DriverLookupRecord[]>([]);
  const [sites, setSites] = useState<SiteLookupRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scopeStatus, setScopeStatus] = useState<ScopeStatus>('full_tenant_scope');

  useEffect(() => {
    const dateParam = searchParams.get('date') ?? '';
    const from = searchParams.get('from') ?? '';
    const to = searchParams.get('to') ?? '';
    const vehicle = searchParams.get('vehicle_id') ?? '';
    const site = searchParams.get('site_id') ?? '';
    const driver = searchParams.get('driver_id') ?? '';
    const status = searchParams.get('status');
    const skip = searchParams.get('skip_only');
    const issue = searchParams.get('issue_only');
    const critical = searchParams.get('critical_only');
    const repeated = searchParams.get('repeated_vehicle_only');
    const related = searchParams.get('related_record_id') ?? '';

    if (dateParam) {
      setDate(dateParam);
    }
    setFromDate(from);
    setToDate(to);
    setVehicleId(vehicle);
    setSiteId(site);
    setDriverId(driver);
    setStatusFilter(status === 'DRAFT' || status === 'SUBMITTED' ? status : 'ALL');
    setSkipOnly(skip === 'true');
    setIssueOnly(issue === 'true');
    setCriticalOnly(critical === 'true');
    setRepeatedOnly(repeated === 'true');
    setRelatedRecordId(related);
  }, [searchParams]);

  async function refresh(currentHost: string, accessToken: string) {
    const [checksResult, vehiclesResult, driversResult, sitesResult] = await Promise.all([
      listDailyChecks(currentHost, accessToken, {
        date: fromDate || toDate ? undefined : date,
        from: fromDate || undefined,
        to: toDate || undefined,
        related_record_id: relatedRecordId || undefined,
        vehicle_id: vehicleId || undefined,
        site_id: siteId || undefined,
        driver_id: driverId || undefined,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        skip_only: skipOnly ? 'true' : undefined,
        issue_only: issueOnly ? 'true' : undefined,
        critical_only: criticalOnly ? 'true' : undefined,
        repeated_vehicle_only: repeatedOnly ? 'true' : undefined,
      }),
      listTenantVehicles(currentHost, accessToken, { limit: '100' }),
      listTenantDrivers(currentHost, accessToken, { limit: '100' }),
      listTenantSites(currentHost, accessToken, { limit: '100' }),
    ]);

    setChecks(checksResult.items);
    setVehicles(vehiclesResult.items);
    setDrivers(driversResult.items);
    setSites(sitesResult.items);
    setScopeStatus(checksResult.scope_status ?? 'full_tenant_scope');
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
        setError(caught instanceof Error ? caught.message : 'Unable to load daily checks.');
      })
      .finally(() => setLoading(false));
  }, [
    criticalOnly,
    date,
    driverId,
    fromDate,
    host,
    issueOnly,
    relatedRecordId,
    repeatedOnly,
    router,
    siteId,
    skipOnly,
    statusFilter,
    subdomain,
    toDate,
    vehicleId,
  ]);

  const summary = useMemo(() => {
    const submitted = checks.filter((item) => item.status === 'SUBMITTED').length;
    const pending = checks.length - submitted;
    const issues = checks.filter((item) => item.stats.not_ok_count > 0).length;
    const critical = checks.filter((item) => item.signals.critical_not_ok_count > 0).length;
    const repeated = checks.filter((item) => item.signals.vehicle_has_repeated_issues).length;
    return { submitted, pending, issues, critical, repeated };
  }, [checks]);

  function handleLogout() {
    if (subdomain) {
      window.localStorage.removeItem(getTenantTokenKey(subdomain));
    }
    router.replace('/');
  }

  return (
    <TenantSidebarLayout
      subdomain={subdomain ?? 'tenant'}
      title="Daily checks monitoring"
      description="Monitor checklist completion, missing checks, and issue flags."
      onSignOut={handleLogout}
    >
      <section className="kpi-grid five">
        <article className="card kpi-card">
          <h3>Submitted</h3>
          <p className="kpi-value">{summary.submitted}</p>
        </article>
        <article className="card kpi-card">
          <h3>Pending</h3>
          <p className="kpi-value">{summary.pending}</p>
        </article>
        <article className="card kpi-card">
          <h3>Issue Flags</h3>
          <p className="kpi-value">{summary.issues}</p>
        </article>
        <article className="card kpi-card">
          <h3>Critical Issues</h3>
          <p className="kpi-value">{summary.critical}</p>
        </article>
        <article className="card kpi-card">
          <h3>Repeated Vehicles</h3>
          <p className="kpi-value">{summary.repeated}</p>
        </article>
      </section>

      {scopeStatus === 'no_site_scope_assigned' ? <ScopeEmptyState /> : null}

      <section className="card" data-testid="daily-checks-monitoring-module">
        <div className="toolbar">
          <h2>Checklist records</h2>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => {
              setVehicleId('');
              setSiteId('');
              setDriverId('');
              setStatusFilter('ALL');
              setSkipOnly(false);
              setDate(new Date().toISOString().slice(0, 10));
              setFromDate('');
              setToDate('');
              setIssueOnly(false);
              setCriticalOnly(false);
              setRepeatedOnly(false);
              setRelatedRecordId('');
            }}
          >
            Reset filters
          </button>
        </div>
        <div className="inline-grid four">
          <label className="field">
            <span>Date</span>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <label className="field">
            <span>From</span>
            <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
          </label>
          <label className="field">
            <span>To</span>
            <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
          </label>
          <label className="field">
            <span>Vehicle</span>
            <select value={vehicleId} onChange={(event) => setVehicleId(event.target.value)}>
              <option value="">All vehicles</option>
              {vehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.fleet_no} {vehicle.plate_no ? `(${vehicle.plate_no})` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Site</span>
            <select value={siteId} onChange={(event) => setSiteId(event.target.value)}>
              <option value="">All sites</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.site_code} - {site.site_name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="inline-grid four">
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
            <span>Status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
              <option value="ALL">All</option>
              <option value="DRAFT">Pending</option>
              <option value="SUBMITTED">Submitted</option>
            </select>
          </label>
          <label className="checkbox-field">
            <input checked={skipOnly} onChange={(event) => setSkipOnly(event.target.checked)} type="checkbox" />
            <span>Missing submissions only</span>
          </label>
          <label className="checkbox-field">
            <input checked={issueOnly} onChange={(event) => setIssueOnly(event.target.checked)} type="checkbox" />
            <span>Issues only</span>
          </label>
          <label className="checkbox-field">
            <input checked={criticalOnly} onChange={(event) => setCriticalOnly(event.target.checked)} type="checkbox" />
            <span>Critical only</span>
          </label>
          <label className="checkbox-field">
            <input checked={repeatedOnly} onChange={(event) => setRepeatedOnly(event.target.checked)} type="checkbox" />
            <span>Repeated vehicle issues</span>
          </label>
        </div>
        {relatedRecordId ? (
          <p className="status">
            Focused on record <code>{relatedRecordId}</code>.
          </p>
        ) : null}

        {loading ? <p className="status">Loading checklist records...</p> : null}
        {error ? <p className="status error">{error}</p> : null}
        {!loading && !error && checks.length === 0 ? (
          <p className="status">
            {relatedRecordId
              ? 'The targeted daily check is no longer available in your current scope. Showing current filtered results.'
              : 'No checklist records found for this filter set.'}
          </p>
        ) : null}
        {!loading && !error && checks.length > 0 ? (
          <div className="table">
            <div className="table-row table-head daily-check-table-row-monitor">
              <span>Date</span>
              <span>Vehicle</span>
              <span>Status</span>
              <span>Issue</span>
              <span>Signals</span>
              <span>Action</span>
            </div>
            {checks.map((check) => {
              const issueLabel = issueLabelText(check.status, check.stats.not_ok_count);
              return (
                <div
                  className={`table-row daily-check-table-row-monitor${relatedRecordId === check.id ? ' row-highlight' : ''}`}
                  key={check.id}
                >
                  <span className="daily-check-cell">{check.check_date}</span>
                  <span className="daily-check-cell">{check.vehicle.fleet_no}</span>
                  <span className="daily-check-cell">
                    <span className="status-pill">{checkStatusLabel(check.status)}</span>
                  </span>
                  <span className="daily-check-cell">{issueLabel}</span>
                  <span className="daily-check-cell">
                    {check.signals.critical_not_ok_count > 0
                      ? `🚨 ${check.signals.critical_not_ok_count} critical`
                      : check.signals.vehicle_has_repeated_issues
                        ? `⚠️ Repeated (${check.signals.repeated_issue_count_7d}/7d)`
                        : check.signals.driver_draft_count_7d > 0
                          ? `🟠 Driver draft ${check.signals.driver_draft_count_7d}/7d`
                          : '—'}
                  </span>
                  <span className="daily-check-cell">
                    <Link href={`/daily-checks/${check.id}`}>View</Link>
                  </span>
                </div>
              );
            })}
          </div>
        ) : null}
      </section>
    </TenantSidebarLayout>
  );
}
