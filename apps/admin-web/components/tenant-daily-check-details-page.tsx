'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSearchParams } from 'next/navigation';

import type { ChecklistMasterResponse, DailyCheckDetailsResponse } from '@fleet-fuel/shared';

import { ApiClientError, getChecklistMaster, getDailyCheck } from '../lib/api';
import { getTenantTokenKey } from '../lib/tenant-session';
import { TenantSidebarLayout } from './tenant-sidebar-layout';

interface TenantDailyCheckDetailsPageProps {
  id: string;
  host: string | null;
  subdomain: string | null;
}

export function TenantDailyCheckDetailsPage({ id, host, subdomain }: TenantDailyCheckDetailsPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [details, setDetails] = useState<DailyCheckDetailsResponse | null>(null);
  const [master, setMaster] = useState<ChecklistMasterResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const totalItems = useMemo(() => master?.sections.reduce((sum, section) => sum + section.items.length, 0) ?? 0, [master]);

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
    router.replace('/');
  }

  return (
    <TenantSidebarLayout
      subdomain={subdomain ?? 'tenant'}
      title="Daily checklist details"
      description={`Check ID ${id}`}
      onSignOut={handleLogout}
    >
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
            <Link
              href={`/daily-checks?${new URLSearchParams({
                date: searchParams.get('date') ?? '',
                from: searchParams.get('from') ?? '',
                to: searchParams.get('to') ?? '',
                vehicle_id: searchParams.get('vehicle_id') ?? '',
                driver_id: searchParams.get('driver_id') ?? '',
                site_id: searchParams.get('site_id') ?? '',
                issue_only: searchParams.get('issue_only') ?? '',
                critical_only: searchParams.get('critical_only') ?? '',
              }).toString()}`}
            >
              Open filtered daily checks
            </Link>
          </p>
        </section>
      ) : null}

      {!loading && details && master ? (
        <section className="card">
          <div className="toolbar">
            <div>
              <h2>
                {details.vehicle.fleet_no} checklist for {details.check_date}
              </h2>
              <p>
                Status: <strong>{details.status}</strong>. Items: {totalItems}
              </p>
            </div>
          </div>
          <div className="stack">
            {master.sections.map((section) => (
              <section className="inset-card" key={section.section_code}>
                <h3>{section.section_name}</h3>
                <div className="stack">
                  {section.items.map((item) => (
                    <div className="checklist-item" key={item.item_code}>
                      <div className="checklist-item-head">
                        <strong>{item.item_name}</strong>
                        <span className="status">{item.required ? 'Required' : 'Optional'}</span>
                      </div>
                      {(() => {
                        const existing = details.items.find((entry) => entry.item_code === item.item_code);
                        return (
                          <>
                            <p className="status">Status: {existing?.status ?? 'NOT_RECORDED'}</p>
                            <p className="status">Notes: {existing?.notes || '—'}</p>
                          </>
                        );
                      })()}
                    </div>
                  ))}
                </div>
              </section>
            ))}
            {error ? <p className="status error">{error}</p> : null}
          </div>
        </section>
      ) : null}
    </TenantSidebarLayout>
  );
}
