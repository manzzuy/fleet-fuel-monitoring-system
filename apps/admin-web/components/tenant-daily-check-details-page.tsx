'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

import type { ChecklistMasterResponse, DailyCheckDetailsResponse } from '@fleet-fuel/shared';

import { ApiClientError, getChecklistMaster, getDailyCheck } from '../lib/api';
import { buildTenantLoginPath, getTenantTokenKey } from '../lib/tenant-session';
import { TenantSidebarLayout } from './tenant-sidebar-layout';
import { buildPaperChecklistModel, PaperChecklistRenderer, type PaperUiStatus } from '../../../packages/shared/ui/paper-checklist-renderer';

interface TenantDailyCheckDetailsPageProps {
  id: string;
  host: string | null;
  subdomain: string | null;
  printMode?: boolean;
}

function toUiStatus(status: 'OK' | 'NOT_OK' | 'NA'): PaperUiStatus {
  if (status === 'OK') return 'PASS';
  if (status === 'NOT_OK') return 'ISSUE';
  return null;
}

export function TenantDailyCheckDetailsPage({
  id,
  host,
  subdomain,
  printMode = false,
}: TenantDailyCheckDetailsPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [details, setDetails] = useState<DailyCheckDetailsResponse | null>(null);
  const [master, setMaster] = useState<ChecklistMasterResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const tenantParam = searchParams.get('tenant');

  const paperModel = useMemo(() => (master ? buildPaperChecklistModel(master.sections) : null), [master]);

  const statusByUiKey = useMemo(() => {
    if (!paperModel || !details) {
      return {} as Record<string, PaperUiStatus>;
    }
    const byApiCode = new Map<string, string>();
    for (const item of paperModel.configuredItems) {
      if (item.apiItemCode) {
        byApiCode.set(item.apiItemCode, item.uiKey);
      }
    }
    const output: Record<string, PaperUiStatus> = {};
    for (const item of details.items) {
      const uiKey = byApiCode.get(item.item_code);
      if (!uiKey) continue;
      output[uiKey] = toUiStatus(item.status);
    }
    return output;
  }, [details, paperModel]);

  const issueDetails = useMemo(
    () => details?.items.filter((item) => item.status === 'NOT_OK') ?? [],
    [details],
  );

  async function refresh(currentHost: string, accessToken: string) {
    const [detailsResult, masterResult] = await Promise.all([
      getDailyCheck(currentHost, accessToken, id),
      getChecklistMaster(currentHost, accessToken),
    ]);

    setDetails(detailsResult);
    setMaster(masterResult);
  }

  useEffect(() => {
    if (!host || !subdomain) {
      router.replace('/');
      return;
    }

    const stored = window.localStorage.getItem(getTenantTokenKey(subdomain));
    if (!stored) {
      router.replace('/');
      return;
    }

    setLoading(true);
    void refresh(host, stored)
      .catch((caught) => {
        if (caught instanceof ApiClientError) {
          setError(`${caught.message}${caught.requestId ? ` (request_id: ${caught.requestId})` : ''}`);
          return;
        }
        setError(caught instanceof Error ? caught.message : 'Unable to load daily check.');
      })
      .finally(() => setLoading(false));
  }, [host, id, router, subdomain]);

  function handleLogout() {
    if (subdomain) {
      window.localStorage.removeItem(getTenantTokenKey(subdomain));
    }
    router.replace(buildTenantLoginPath(subdomain));
  }

  const filteredDailyChecksLink = `/daily-checks?${new URLSearchParams({
    date: searchParams.get('date') ?? '',
    from: searchParams.get('from') ?? '',
    to: searchParams.get('to') ?? '',
    vehicle_id: searchParams.get('vehicle_id') ?? '',
    driver_id: searchParams.get('driver_id') ?? '',
    site_id: searchParams.get('site_id') ?? '',
    issue_only: searchParams.get('issue_only') ?? '',
    critical_only: searchParams.get('critical_only') ?? '',
    tenant: tenantParam ?? '',
  }).toString()}`;

  const content = (
    <>
      {loading ? (
        <section className="card">
          <p className="status">Loading daily checklist...</p>
        </section>
      ) : null}

      {!loading && !details ? (
        <section className="card">
          <p className="status error">{error ?? 'Daily check record is not available in your current scope.'}</p>
          <p className="status">
            This can happen when the alert record was resolved after data changed. Use the filtered monitoring view.
          </p>
          <p className="status">
            <Link href={filteredDailyChecksLink}>Open filtered daily checks</Link>
          </p>
        </section>
      ) : null}

      {!loading && details && paperModel ? (
        <section className={`card ${printMode ? 'print-report-card' : ''}`} data-testid="admin-checklist-report">
          <div className="toolbar no-print">
            <div>
              <h2>
                {details.vehicle.fleet_no} checklist for {details.check_date}
              </h2>
              <p>
                Status: <strong>{details.status}</strong>
              </p>
            </div>
            {!printMode ? (
              <Link
                className="button button-secondary"
                data-testid="admin-checklist-print-button"
                href={`/daily-checks/${id}/print${tenantParam ? `?tenant=${encodeURIComponent(tenantParam)}` : ''}`}
                target="_blank"
              >
                Print / Save PDF
              </Link>
            ) : null}
          </div>

          <div className="paper-report-meta">
            <div><strong>Driver:</strong> {details.driver?.full_name ?? '—'}</div>
            <div>
              <strong>Vehicle:</strong> {details.vehicle.fleet_no}
              {details.vehicle.plate_no ? ` (${details.vehicle.plate_no})` : ''}
            </div>
            <div><strong>Site:</strong> {details.site ? `${details.site.site_code} - ${details.site.site_name}` : '—'}</div>
            <div><strong>Date/Time:</strong> {details.check_date}</div>
            <div><strong>Odometer:</strong> Not recorded in checklist payload</div>
          </div>

          <PaperChecklistRenderer
            mode={printMode ? 'print' : 'admin'}
            rows={paperModel.rows}
            statuses={statusByUiKey}
            testIdPrefix="admin-checklist"
          />

          <div className="paper-report-defects">
            <h3>Defect Details</h3>
            {issueDetails.length === 0 ? (
              <p className="status">No defect details submitted.</p>
            ) : (
              <div className="stack">
                {issueDetails.map((item) => (
                  <article className="inset-card" key={item.item_code}>
                    <p><strong>{item.item_code}</strong></p>
                    <p>Notes: {item.notes?.trim() ? item.notes : '—'}</p>
                    <p>
                      Photo:{' '}
                      {item.photo_url ? (
                        <a href={item.photo_url} rel="noreferrer" target="_blank">
                          View attachment
                        </a>
                      ) : (
                        '—'
                      )}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      ) : null}
    </>
  );

  if (printMode) {
    return (
      <div className="print-page">
        <main>{content}</main>
      </div>
    );
  }

  return (
    <TenantSidebarLayout
      subdomain={subdomain ?? 'tenant'}
      title="Daily checklist details"
      description={`Check ID ${id}`}
      onSignOut={handleLogout}
    >
      {content}
    </TenantSidebarLayout>
  );
}
