'use client';

import { Fragment, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { SiteLookupRecord } from '@fleet-fuel/shared';
import type { ScopeStatus } from '@fleet-fuel/shared';

import { ApiClientError, createMasterSite, listTenantSites, updateMasterSite } from '../lib/api';
import { isSafetyOfficerRole, isSiteSupervisorRole } from '../lib/roles';
import { buildTenantLoginPath, getTenantRoleFromToken, getTenantTokenKey, type TenantStaffRole } from '../lib/tenant-session';
import { ScopeEmptyState } from './scope-empty-state';
import { TenantSidebarLayout } from './tenant-sidebar-layout';

interface TenantSitesPageProps {
  host: string | null;
  subdomain: string | null;
}

export function TenantSitesPage({ host, subdomain }: TenantSitesPageProps) {
  const router = useRouter();
  const [rows, setRows] = useState<SiteLookupRecord[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scopeStatus, setScopeStatus] = useState<ScopeStatus>('full_tenant_scope');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    site_code: '',
    site_name: '',
    location: '',
    is_active: true,
  });
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [role, setRole] = useState<TenantStaffRole | null>(null);

  async function refreshSites(currentSearch: string) {
    if (!host || !subdomain) {
      return;
    }
    const token = window.localStorage.getItem(getTenantTokenKey(subdomain));
    if (!token) {
      router.replace(buildTenantLoginPath(subdomain));
      return;
    }
    const currentRole = getTenantRoleFromToken(token);
    setRole(currentRole);
    if (isSiteSupervisorRole(currentRole) || isSafetyOfficerRole(currentRole)) {
      router.replace('/dashboard');
      return;
    }
    const result = await listTenantSites(host, token, { limit: '100', search: currentSearch || undefined });
    setRows(result.items);
    setScopeStatus(result.scope_status ?? 'full_tenant_scope');
  }

  useEffect(() => {
    if (!host || !subdomain) {
      router.replace(buildTenantLoginPath(subdomain));
      return;
    }

    const token = window.localStorage.getItem(getTenantTokenKey(subdomain));
    if (!token) {
      router.replace(buildTenantLoginPath(subdomain));
      return;
    }
    const currentRole = getTenantRoleFromToken(token);
    setRole(currentRole);
    if (isSiteSupervisorRole(currentRole) || isSafetyOfficerRole(currentRole)) {
      router.replace('/dashboard');
      return;
    }

    setLoading(true);
    setError(null);
    void listTenantSites(host, token, { limit: '100', search: search || undefined })
      .then((result) => {
        setRows(result.items);
        setScopeStatus(result.scope_status ?? 'full_tenant_scope');
      })
      .catch((caught) => {
        if (caught instanceof ApiClientError) {
          const message =
            caught.code === 'route_not_found'
              ? 'Site data endpoint is unavailable in the current API runtime. Restart the API server and retry.'
              : caught.message;
          setError(`${message}${caught.requestId ? ` (request_id: ${caught.requestId})` : ''}`);
          return;
        }
        setError(caught instanceof Error ? caught.message : 'Unable to load sites.');
      })
      .finally(() => setLoading(false));
  }, [host, router, search, subdomain]);

  function startCreate() {
    setEditingId('new');
    setForm({
      site_code: '',
      site_name: '',
      location: '',
      is_active: true,
    });
    setMessage(null);
  }

  function startEdit(row: SiteLookupRecord) {
    setEditingId(row.id);
    setForm({
      site_code: row.site_code,
      site_name: row.site_name,
      location: row.location ?? '',
      is_active: row.is_active,
    });
    setMessage(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setMessage(null);
  }

  async function saveEdit() {
    if (!host || !subdomain) {
      return;
    }
    const token = window.localStorage.getItem(getTenantTokenKey(subdomain));
    if (!token) {
      router.replace(buildTenantLoginPath(subdomain));
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      if (editingId === 'new') {
        await createMasterSite(host, token, {
          site_code: form.site_code.trim(),
          site_name: form.site_name.trim(),
          location: form.location.trim() || null,
          is_active: form.is_active,
        });
        setMessage('Site created.');
      } else if (editingId) {
        await updateMasterSite(host, token, editingId, {
          site_code: form.site_code.trim(),
          site_name: form.site_name.trim(),
          location: form.location.trim() || null,
          is_active: form.is_active,
        });
        setMessage('Site updated.');
      }
      setEditingId(null);
      await refreshSites(search);
    } catch (caught) {
      const errorMessage = caught instanceof ApiClientError ? caught.message : 'Unable to save site.';
      setMessage(errorMessage);
    } finally {
      setSaving(false);
    }
  }

  function handleLogout() {
    if (subdomain) {
      window.localStorage.removeItem(getTenantTokenKey(subdomain));
    }
    setRole(null);
    router.replace(buildTenantLoginPath(subdomain));
  }

  return (
    <TenantSidebarLayout
      subdomain={subdomain ?? 'tenant'}
      role={role}
      title="Sites monitoring"
      description="Site list and operational details."
      onSignOut={handleLogout}
    >
      {scopeStatus === 'no_site_scope_assigned' ? <ScopeEmptyState /> : null}
      <section className="card" data-testid="sites-monitoring-module">
        <div className="toolbar">
          <h2>Sites</h2>
          <label className="field compact">
            <span>Search</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Code, name, location" />
          </label>
          <button className="button" type="button" onClick={startCreate}>
            Add site
          </button>
        </div>
        {editingId === 'new' ? (
          <div className="inline-create-panel" data-testid="sites-edit-form">
            <div className="inline-grid four master-form-grid">
              <label className="field">
                <span>Site code</span>
                <input value={form.site_code} onChange={(event) => setForm((current) => ({ ...current, site_code: event.target.value }))} />
              </label>
              <label className="field">
                <span>Site name</span>
                <input value={form.site_name} onChange={(event) => setForm((current) => ({ ...current, site_name: event.target.value }))} />
              </label>
              <label className="field">
                <span>Location</span>
                <input value={form.location} onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))} />
              </label>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))}
                />
                <span>Active</span>
              </label>
              <div className="edit-actions">
                <button className="button" type="button" onClick={() => void saveEdit()} disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button className="button button-secondary" type="button" onClick={cancelEdit} disabled={saving}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {loading ? <p className="status">Loading sites...</p> : null}
        {error ? <p className="status error">{error}</p> : null}
        {!loading && !error && rows.length === 0 ? <p className="status">No sites found.</p> : null}
        {!loading && !error && rows.length > 0 ? (
          <div className="table">
            <div className="table-row table-head sites-table-row">
              <span>Site code</span>
              <span>Site name</span>
              <span>Location</span>
              <span>Status</span>
              <span>Action</span>
            </div>
            {rows.map((row) => (
              <Fragment key={row.id}>
                <div className={`table-row sites-table-row ${editingId === row.id ? 'row-highlight' : ''}`}>
                  <span>{row.site_code}</span>
                  <span>{row.site_name}</span>
                  <span>{row.location ?? '—'}</span>
                  <span>
                    <span className={`status-pill ${row.is_active ? 'good' : 'issue'}`}>
                      {row.is_active ? '🟢 Active' : '🔴 Inactive'}
                    </span>
                  </span>
                  <span className="edit-action-cell">
                    <button
                      aria-label={`Edit ${row.site_code}`}
                      className="button button-secondary edit-icon-button"
                      title="Edit site"
                      type="button"
                      onClick={() => startEdit(row)}
                    >
                      ✎
                    </button>
                  </span>
                </div>
                {editingId === row.id ? (
                  <div className="table-row master-edit-row" data-testid="sites-edit-form">
                    <div className="inline-grid four master-form-grid">
                      <label className="field">
                        <span>Site code</span>
                        <input value={form.site_code} onChange={(event) => setForm((current) => ({ ...current, site_code: event.target.value }))} />
                      </label>
                      <label className="field">
                        <span>Site name</span>
                        <input value={form.site_name} onChange={(event) => setForm((current) => ({ ...current, site_name: event.target.value }))} />
                      </label>
                      <label className="field">
                        <span>Location</span>
                        <input value={form.location} onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))} />
                      </label>
                      <label className="checkbox-field">
                        <input
                          type="checkbox"
                          checked={form.is_active}
                          onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))}
                        />
                        <span>Active</span>
                      </label>
                      <div className="edit-actions">
                        <button className="button" type="button" onClick={() => void saveEdit()} disabled={saving}>
                          {saving ? 'Saving…' : 'Save'}
                        </button>
                        <button className="button button-secondary" type="button" onClick={cancelEdit} disabled={saving}>
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
