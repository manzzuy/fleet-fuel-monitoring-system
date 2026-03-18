'use client';

import { Fragment, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { TankLookupRecord } from '@fleet-fuel/shared';
import type { ScopeStatus } from '@fleet-fuel/shared';

import { ApiClientError, createMasterTank, listTenantSites, listTenantTanks, updateMasterTank } from '../lib/api';
import { formatSiteDisplayName } from '../lib/display-format';
import { getTenantTokenKey } from '../lib/tenant-session';
import { ScopeEmptyState } from './scope-empty-state';
import { TenantSidebarLayout } from './tenant-sidebar-layout';

interface TenantTanksPageProps {
  host: string | null;
  subdomain: string | null;
}

export function TenantTanksPage({ host, subdomain }: TenantTanksPageProps) {
  const router = useRouter();
  const [rows, setRows] = useState<TankLookupRecord[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scopeStatus, setScopeStatus] = useState<ScopeStatus>('full_tenant_scope');
  const [sites, setSites] = useState<Array<{ id: string; site_code: string; site_name: string }>>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    tank_name: '',
    capacity_l: '',
    reorder_level_l: '',
    site_id: '',
  });
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function refreshData(currentSearch: string) {
    if (!host || !subdomain) {
      return;
    }
    const token = window.localStorage.getItem(getTenantTokenKey(subdomain));
    if (!token) {
      router.replace('/');
      return;
    }
    const [tanksResult, sitesResult] = await Promise.all([
      listTenantTanks(host, token, { limit: '100', search: currentSearch || undefined }),
      listTenantSites(host, token, { limit: '100' }),
    ]);
    setRows(tanksResult.items);
    setScopeStatus(tanksResult.scope_status ?? 'full_tenant_scope');
    setSites(sitesResult.items);
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
    void Promise.all([
      listTenantTanks(host, token, { limit: '100', search: search || undefined }),
      listTenantSites(host, token, { limit: '100' }),
    ])
      .then(([tanksResult, sitesResult]) => {
        setRows(tanksResult.items);
        setScopeStatus(tanksResult.scope_status ?? 'full_tenant_scope');
        setSites(sitesResult.items);
      })
      .catch((caught) => {
        if (caught instanceof ApiClientError) {
          const message =
            caught.code === 'route_not_found'
              ? 'Tank data endpoint is unavailable in the current API runtime. Restart the API server and retry.'
              : caught.message;
          setError(`${message}${caught.requestId ? ` (request_id: ${caught.requestId})` : ''}`);
          return;
        }
        setError(caught instanceof Error ? caught.message : 'Unable to load tanks.');
      })
      .finally(() => setLoading(false));
  }, [host, router, search, subdomain]);

  function startCreate() {
    setEditingId('new');
    setForm({
      tank_name: '',
      capacity_l: '',
      reorder_level_l: '',
      site_id: '',
    });
    setMessage(null);
  }

  function startEdit(row: TankLookupRecord) {
    setEditingId(row.id);
    setForm({
      tank_name: row.tank_name,
      capacity_l: row.capacity_l,
      reorder_level_l: row.reorder_level_l,
      site_id: row.site.id,
    });
    setMessage(null);
  }

  async function saveEdit() {
    if (!host || !subdomain) {
      return;
    }
    const token = window.localStorage.getItem(getTenantTokenKey(subdomain));
    if (!token) {
      router.replace('/');
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      if (editingId === 'new') {
        await createMasterTank(host, token, {
          tank_name: form.tank_name.trim(),
          capacity_l: form.capacity_l.trim(),
          reorder_level_l: form.reorder_level_l.trim(),
          site_id: form.site_id,
        });
        setMessage('Tank created.');
      } else if (editingId) {
        await updateMasterTank(host, token, editingId, {
          tank_name: form.tank_name.trim(),
          capacity_l: form.capacity_l.trim(),
          reorder_level_l: form.reorder_level_l.trim(),
          site_id: form.site_id,
        });
        setMessage('Tank updated.');
      }
      setEditingId(null);
      await refreshData(search);
    } catch (caught) {
      const errorMessage = caught instanceof ApiClientError ? caught.message : 'Unable to save tank.';
      setMessage(errorMessage);
    } finally {
      setSaving(false);
    }
  }

  function handleLogout() {
    if (subdomain) {
      window.localStorage.removeItem(getTenantTokenKey(subdomain));
    }
    router.replace('/');
  }

  return (
    <TenantSidebarLayout
      subdomain={subdomain ?? 'tenant'}
      title="Tanks monitoring"
      description="Tank inventory, reorder levels, and site association."
      onSignOut={handleLogout}
    >
      {scopeStatus === 'no_site_scope_assigned' ? <ScopeEmptyState /> : null}
      <section className="card" data-testid="tanks-monitoring-module">
        <div className="toolbar">
          <h2>Tanks</h2>
          <label className="field compact">
            <span>Search</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tank or site" />
          </label>
          <button className="button" type="button" onClick={startCreate}>
            Add tank
          </button>
        </div>
        {editingId === 'new' ? (
          <div className="inline-create-panel" data-testid="tanks-edit-form">
            <div className="inline-grid four master-form-grid">
              <label className="field">
                <span>Tank name</span>
                <input value={form.tank_name} onChange={(event) => setForm((current) => ({ ...current, tank_name: event.target.value }))} />
              </label>
              <label className="field">
                <span>Capacity (L)</span>
                <input value={form.capacity_l} onChange={(event) => setForm((current) => ({ ...current, capacity_l: event.target.value }))} />
              </label>
              <label className="field">
                <span>Reorder level (L)</span>
                <input
                  value={form.reorder_level_l}
                  onChange={(event) => setForm((current) => ({ ...current, reorder_level_l: event.target.value }))}
                />
              </label>
              <label className="field">
                <span>Site</span>
                <select value={form.site_id} onChange={(event) => setForm((current) => ({ ...current, site_id: event.target.value }))}>
                  <option value="">Select site</option>
                  {sites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {formatSiteDisplayName(site)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="edit-actions">
                <button className="button" type="button" onClick={() => void saveEdit()} disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button className="button button-secondary" type="button" onClick={() => setEditingId(null)} disabled={saving}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {loading ? <p className="status">Loading tanks...</p> : null}
        {error ? <p className="status error">{error}</p> : null}
        {!loading && !error && rows.length === 0 ? <p className="status">No tanks found.</p> : null}
        {!loading && !error && rows.length > 0 ? (
          <div className="table">
            <div className="table-row table-head tanks-table-row">
              <span>Tank</span>
              <span>Capacity (L)</span>
              <span>Reorder (L)</span>
              <span>Site</span>
              <span>Action</span>
            </div>
            {rows.map((row) => (
              <Fragment key={row.id}>
                <div className={`table-row tanks-table-row ${editingId === row.id ? 'row-highlight' : ''}`}>
                  <span>{row.tank_name}</span>
                  <span>{row.capacity_l}</span>
                  <span>{row.reorder_level_l}</span>
                  <span>{formatSiteDisplayName(row.site)}</span>
                  <span className="edit-action-cell">
                    <button
                      aria-label={`Edit ${row.tank_name}`}
                      className="button button-secondary edit-icon-button"
                      title="Edit tank"
                      type="button"
                      onClick={() => startEdit(row)}
                    >
                      ✎
                    </button>
                  </span>
                </div>
                {editingId === row.id ? (
                  <div className="table-row master-edit-row" data-testid="tanks-edit-form">
                    <div className="inline-grid four master-form-grid">
                      <label className="field">
                        <span>Tank name</span>
                        <input value={form.tank_name} onChange={(event) => setForm((current) => ({ ...current, tank_name: event.target.value }))} />
                      </label>
                      <label className="field">
                        <span>Capacity (L)</span>
                        <input value={form.capacity_l} onChange={(event) => setForm((current) => ({ ...current, capacity_l: event.target.value }))} />
                      </label>
                      <label className="field">
                        <span>Reorder level (L)</span>
                        <input
                          value={form.reorder_level_l}
                          onChange={(event) => setForm((current) => ({ ...current, reorder_level_l: event.target.value }))}
                        />
                      </label>
                      <label className="field">
                        <span>Site</span>
                        <select value={form.site_id} onChange={(event) => setForm((current) => ({ ...current, site_id: event.target.value }))}>
                          <option value="">Select site</option>
                          {sites.map((site) => (
                            <option key={site.id} value={site.id}>
                              {formatSiteDisplayName(site)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="edit-actions">
                        <button className="button" type="button" onClick={() => void saveEdit()} disabled={saving}>
                          {saving ? 'Saving…' : 'Save'}
                        </button>
                        <button className="button button-secondary" type="button" onClick={() => setEditingId(null)} disabled={saving}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </Fragment>
            ))}
          </div>
        ) : null}
        {message ? <p className={message.includes('Unable') ? 'status error' : 'status'}>{message}</p> : null}
      </section>
    </TenantSidebarLayout>
  );
}
