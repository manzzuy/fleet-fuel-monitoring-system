'use client';

import { Fragment, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { ComplianceRecordItem, ComplianceTypeRecord, DriverLookupRecord } from '@fleet-fuel/shared';
import type { ScopeStatus } from '@fleet-fuel/shared';

import {
  ApiClientError,
  createMasterDriver,
  createComplianceRecord,
  createComplianceType,
  listComplianceRecords,
  listComplianceTypes,
  listMasterDrivers,
  listTenantSites,
  listTenantVehicles,
  updateMasterDriver,
} from '../lib/api';
import { getTenantTokenKey } from '../lib/tenant-session';
import { ScopeEmptyState } from './scope-empty-state';
import { TenantSidebarLayout } from './tenant-sidebar-layout';

interface TenantDriversPageProps {
  host: string | null;
  subdomain: string | null;
}

export function TenantDriversPage({ host, subdomain }: TenantDriversPageProps) {
  const router = useRouter();
  const [rows, setRows] = useState<DriverLookupRecord[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scopeStatus, setScopeStatus] = useState<ScopeStatus>('full_tenant_scope');
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [complianceTypes, setComplianceTypes] = useState<ComplianceTypeRecord[]>([]);
  const [complianceRows, setComplianceRows] = useState<ComplianceRecordItem[]>([]);
  const [newTypeName, setNewTypeName] = useState('');
  const [newTypeRequiresExpiry, setNewTypeRequiresExpiry] = useState(true);
  const [selectedTypeId, setSelectedTypeId] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [issuedAt, setIssuedAt] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [complianceMessage, setComplianceMessage] = useState<string | null>(null);
  const [sites, setSites] = useState<Array<{ id: string; site_code: string; site_name: string }>>([]);
  const [vehicles, setVehicles] = useState<Array<{ id: string; fleet_no: string; plate_no: string | null }>>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [driverForm, setDriverForm] = useState({
    full_name: '',
    employee_no: '',
    username: '',
    site_id: '',
    assigned_vehicle_id: '',
    is_active: true,
  });
  const [driverMessage, setDriverMessage] = useState<string | null>(null);
  const [driverSaving, setDriverSaving] = useState(false);

  async function refreshDriverData(currentSearch: string) {
    if (!host || !subdomain) {
      return;
    }
    const token = window.localStorage.getItem(getTenantTokenKey(subdomain));
    if (!token) {
      router.replace('/');
      return;
    }
    const [driversResult, typesResult, sitesResult, vehiclesResult] = await Promise.all([
      listMasterDrivers(host, token, { limit: '100', search: currentSearch || undefined }),
      listComplianceTypes(host, token, { applies_to: 'DRIVER' }),
      listTenantSites(host, token, { limit: '100' }),
      listTenantVehicles(host, token, { limit: '100' }),
    ]);
    setRows(driversResult.items);
    setScopeStatus(driversResult.scope_status ?? 'full_tenant_scope');
    setComplianceTypes(typesResult.items.filter((item) => item.is_active));
    setSites(sitesResult.items);
    setVehicles(vehiclesResult.items.map((item) => ({ id: item.id, fleet_no: item.fleet_no, plate_no: item.plate_no })));
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
      listMasterDrivers(host, token, { limit: '100', search: search || undefined }),
      listComplianceTypes(host, token, { applies_to: 'DRIVER' }),
      listTenantSites(host, token, { limit: '100' }),
      listTenantVehicles(host, token, { limit: '100' }),
    ])
      .then(([driversResult, typesResult, sitesResult, vehiclesResult]) => {
        setRows(driversResult.items);
        setScopeStatus(driversResult.scope_status ?? 'full_tenant_scope');
        setComplianceTypes(typesResult.items.filter((item) => item.is_active));
        setSites(sitesResult.items);
        setVehicles(vehiclesResult.items.map((item) => ({ id: item.id, fleet_no: item.fleet_no, plate_no: item.plate_no })));
      })
      .catch((caught) => {
        if (caught instanceof ApiClientError) {
          const message =
            caught.code === 'route_not_found'
              ? 'Driver endpoint is unavailable in the current API runtime. Restart the API server and retry.'
              : caught.message;
          setError(`${message}${caught.requestId ? ` (request_id: ${caught.requestId})` : ''}`);
          return;
        }
        setError(caught instanceof Error ? caught.message : 'Unable to load drivers.');
      })
      .finally(() => setLoading(false));
  }, [host, router, search, subdomain]);

  function startCreate() {
    setEditingId('new');
    setDriverForm({
      full_name: '',
      employee_no: '',
      username: '',
      site_id: '',
      assigned_vehicle_id: '',
      is_active: true,
    });
    setDriverMessage(null);
  }

  function startEdit(row: DriverLookupRecord) {
    setEditingId(row.id);
    setDriverForm({
      full_name: row.full_name,
      employee_no: row.employee_no ?? '',
      username: row.username ?? '',
      site_id: row.site?.id ?? '',
      assigned_vehicle_id: row.assigned_vehicle?.id ?? '',
      is_active: row.is_active ?? true,
    });
    setDriverMessage(null);
  }

  async function saveDriver() {
    if (!host || !subdomain) {
      return;
    }
    const token = window.localStorage.getItem(getTenantTokenKey(subdomain));
    if (!token) {
      router.replace('/');
      return;
    }
    setDriverSaving(true);
    setDriverMessage(null);
    try {
      if (editingId === 'new') {
        await createMasterDriver(host, token, {
          full_name: driverForm.full_name.trim(),
          employee_no: driverForm.employee_no.trim() || null,
          username: driverForm.username.trim(),
          site_id: driverForm.site_id || null,
          assigned_vehicle_id: driverForm.assigned_vehicle_id || null,
          is_active: driverForm.is_active,
        });
        setDriverMessage('Driver created.');
      } else if (editingId) {
        await updateMasterDriver(host, token, editingId, {
          full_name: driverForm.full_name.trim(),
          employee_no: driverForm.employee_no.trim() || null,
          username: driverForm.username.trim(),
          site_id: driverForm.site_id || null,
          assigned_vehicle_id: driverForm.assigned_vehicle_id || null,
          is_active: driverForm.is_active,
        });
        setDriverMessage('Driver updated.');
      }
      setEditingId(null);
      await refreshDriverData(search);
    } catch (caught) {
      setDriverMessage(caught instanceof ApiClientError ? caught.message : 'Unable to save driver.');
    } finally {
      setDriverSaving(false);
    }
  }

  useEffect(() => {
    if (!selectedDriverId || !host || !subdomain) {
      setComplianceRows([]);
      return;
    }

    const token = window.localStorage.getItem(getTenantTokenKey(subdomain));
    if (!token) {
      return;
    }

    void listComplianceRecords(host, token, { applies_to: 'DRIVER', driver_id: selectedDriverId })
      .then((result) => {
        setComplianceRows(result.items);
      })
      .catch(() => {
        setComplianceRows([]);
      });
  }, [host, selectedDriverId, subdomain]);

  useEffect(() => {
    if (!selectedDriverId && rows.length > 0) {
      setSelectedDriverId(rows[0]!.id);
    }
  }, [rows, selectedDriverId]);

  function handleLogout() {
    if (subdomain) {
      window.localStorage.removeItem(getTenantTokenKey(subdomain));
    }
    router.replace('/');
  }

  async function handleCreateType() {
    if (!host || !subdomain || !newTypeName.trim()) {
      return;
    }
    const token = window.localStorage.getItem(getTenantTokenKey(subdomain));
    if (!token) {
      return;
    }
    setComplianceMessage(null);
    try {
      const created = await createComplianceType(host, token, {
        name: newTypeName.trim(),
        applies_to: 'DRIVER',
        requires_expiry: newTypeRequiresExpiry,
      });
      setComplianceTypes((prev) => [...prev, created.item].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedTypeId(created.item.id);
      setNewTypeName('');
      setComplianceMessage('Driver compliance type created.');
    } catch (caught) {
      const message = caught instanceof ApiClientError ? caught.message : 'Unable to create compliance type.';
      setComplianceMessage(message);
    }
  }

  async function handleCreateRecord() {
    if (!host || !subdomain || !selectedDriverId || !selectedTypeId) {
      return;
    }
    const token = window.localStorage.getItem(getTenantTokenKey(subdomain));
    if (!token) {
      return;
    }
    setComplianceMessage(null);
    try {
      await createComplianceRecord(host, token, {
        applies_to: 'DRIVER',
        target_id: selectedDriverId,
        compliance_type_id: selectedTypeId,
        reference_number: referenceNumber || undefined,
        issued_at: issuedAt || undefined,
        expiry_date: expiryDate || undefined,
        notes: notes || undefined,
      });
      const records = await listComplianceRecords(host, token, { applies_to: 'DRIVER', driver_id: selectedDriverId });
      setComplianceRows(records.items);
      setReferenceNumber('');
      setIssuedAt('');
      setExpiryDate('');
      setNotes('');
      setComplianceMessage('Driver compliance record saved.');
    } catch (caught) {
      const message = caught instanceof ApiClientError ? caught.message : 'Unable to save compliance record.';
      setComplianceMessage(message);
    }
  }

  return (
    <TenantSidebarLayout
      subdomain={subdomain ?? 'tenant'}
      title="Drivers monitoring"
      description="Driver status, identity, and assignment visibility."
      onSignOut={handleLogout}
    >
      {scopeStatus === 'no_site_scope_assigned' ? <ScopeEmptyState /> : null}
      <section className="card" data-testid="drivers-monitoring-module">
        <div className="toolbar">
          <h2>Drivers</h2>
          <label className="field compact">
            <span>Search</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, employee, username" />
          </label>
          <button className="button" type="button" onClick={startCreate}>
            Add driver
          </button>
        </div>
        {loading ? <p className="status">Loading drivers...</p> : null}
        {error ? <p className="status error">{error}</p> : null}
        {!loading && !error && rows.length === 0 ? <p className="status">No drivers found.</p> : null}
        {!loading && !error && rows.length > 0 ? (
          <div className="table">
            <div className="table-row table-head drivers-table-row">
              <span>Full name</span>
              <span>Employee no</span>
              <span>Username</span>
              <span>Site</span>
              <span>Status</span>
              <span>Edit</span>
              <span>Compliance</span>
            </div>
            {rows.map((row) => (
              <Fragment key={row.id}>
                <div className={`table-row drivers-table-row ${editingId === row.id ? 'row-highlight' : ''}`}>
                  <span>{row.full_name}</span>
                  <span>{row.employee_no ?? '—'}</span>
                  <span>{row.username ?? '—'}</span>
                  <span>{row.site ? `${row.site.site_code}` : '—'}</span>
                  <span>{row.is_active ? 'ACTIVE' : 'INACTIVE'}</span>
                  <span>
                    <button className="button button-secondary" type="button" onClick={() => startEdit(row)}>
                      Edit
                    </button>
                  </span>
                  <span>
                    <button className="button button-secondary" type="button" onClick={() => setSelectedDriverId(row.id)}>
                      Add training/certification
                    </button>
                  </span>
                </div>
                {editingId === row.id ? (
                  <div className="table-row master-edit-row" data-testid="drivers-edit-form">
                    <div className="inline-grid four">
                      <label className="field">
                        <span>Full name</span>
                        <input value={driverForm.full_name} onChange={(event) => setDriverForm((current) => ({ ...current, full_name: event.target.value }))} />
                      </label>
                      <label className="field">
                        <span>Employee no</span>
                        <input
                          value={driverForm.employee_no}
                          onChange={(event) => setDriverForm((current) => ({ ...current, employee_no: event.target.value }))}
                        />
                      </label>
                      <label className="field">
                        <span>Username</span>
                        <input value={driverForm.username} onChange={(event) => setDriverForm((current) => ({ ...current, username: event.target.value }))} />
                      </label>
                      <label className="field">
                        <span>Assigned site</span>
                        <select value={driverForm.site_id} onChange={(event) => setDriverForm((current) => ({ ...current, site_id: event.target.value }))}>
                          <option value="">Unassigned</option>
                          {sites.map((site) => (
                            <option key={site.id} value={site.id}>
                              {site.site_code} - {site.site_name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>Assigned vehicle</span>
                        <select
                          value={driverForm.assigned_vehicle_id}
                          onChange={(event) => setDriverForm((current) => ({ ...current, assigned_vehicle_id: event.target.value }))}
                        >
                          <option value="">Unassigned</option>
                          {vehicles.map((vehicle) => (
                            <option key={vehicle.id} value={vehicle.id}>
                              {vehicle.fleet_no} {vehicle.plate_no ? `(${vehicle.plate_no})` : ''}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="checkbox-field">
                        <input
                          type="checkbox"
                          checked={driverForm.is_active}
                          onChange={(event) => setDriverForm((current) => ({ ...current, is_active: event.target.checked }))}
                        />
                        <span>Active</span>
                      </label>
                      <div className="toolbar">
                        <button className="button" type="button" onClick={() => void saveDriver()} disabled={driverSaving}>
                          {driverSaving ? 'Saving…' : 'Save'}
                        </button>
                        <button className="button button-secondary" type="button" onClick={() => setEditingId(null)} disabled={driverSaving}>
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
        {editingId === 'new' ? (
          <div className="inline-grid four" data-testid="drivers-edit-form">
            <label className="field">
              <span>Full name</span>
              <input value={driverForm.full_name} onChange={(event) => setDriverForm((current) => ({ ...current, full_name: event.target.value }))} />
            </label>
            <label className="field">
              <span>Employee no</span>
              <input
                value={driverForm.employee_no}
                onChange={(event) => setDriverForm((current) => ({ ...current, employee_no: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>Username</span>
              <input value={driverForm.username} onChange={(event) => setDriverForm((current) => ({ ...current, username: event.target.value }))} />
            </label>
            <label className="field">
              <span>Assigned site</span>
              <select value={driverForm.site_id} onChange={(event) => setDriverForm((current) => ({ ...current, site_id: event.target.value }))}>
                <option value="">Unassigned</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.site_code} - {site.site_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Assigned vehicle</span>
              <select
                value={driverForm.assigned_vehicle_id}
                onChange={(event) => setDriverForm((current) => ({ ...current, assigned_vehicle_id: event.target.value }))}
              >
                <option value="">Unassigned</option>
                {vehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.fleet_no} {vehicle.plate_no ? `(${vehicle.plate_no})` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={driverForm.is_active}
                onChange={(event) => setDriverForm((current) => ({ ...current, is_active: event.target.checked }))}
              />
              <span>Active</span>
            </label>
            <div className="toolbar">
              <button className="button" type="button" onClick={() => void saveDriver()} disabled={driverSaving}>
                {driverSaving ? 'Saving…' : 'Save'}
              </button>
              <button className="button button-secondary" type="button" onClick={() => setEditingId(null)} disabled={driverSaving}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}
        {driverMessage ? <p className={driverMessage.includes('Unable') ? 'status error' : 'status'}>{driverMessage}</p> : null}
      </section>
      <section className="card" data-testid="drivers-compliance-module">
        <h2>Driver compliance records</h2>
        <div className="inline-grid four">
          <label className="field">
            <span>Driver</span>
            <select value={selectedDriverId} onChange={(event) => setSelectedDriverId(event.target.value)}>
              <option value="">Select driver</option>
              {rows.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.full_name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Compliance type</span>
            <select value={selectedTypeId} onChange={(event) => setSelectedTypeId(event.target.value)}>
              <option value="">Select type</option>
              {complianceTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Reference no</span>
            <input value={referenceNumber} onChange={(event) => setReferenceNumber(event.target.value)} />
          </label>
          <label className="field">
            <span>Issued at</span>
            <input type="date" value={issuedAt} onChange={(event) => setIssuedAt(event.target.value)} />
          </label>
        </div>
        <div className="inline-grid three">
          <label className="field">
            <span>Expiry date</span>
            <input type="date" value={expiryDate} onChange={(event) => setExpiryDate(event.target.value)} />
          </label>
          <label className="field">
            <span>Notes</span>
            <input value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
          <div className="field">
            <span>&nbsp;</span>
            <button className="button" type="button" onClick={handleCreateRecord}>
              Add driver compliance
            </button>
          </div>
        </div>
        <div className="inline-grid three">
          <label className="field">
            <span>New type name</span>
            <input value={newTypeName} onChange={(event) => setNewTypeName(event.target.value)} placeholder="e.g. H2S" />
          </label>
          <label className="checkbox-field">
            <input
              checked={newTypeRequiresExpiry}
              onChange={(event) => setNewTypeRequiresExpiry(event.target.checked)}
              type="checkbox"
            />
            <span>Requires expiry date</span>
          </label>
          <div className="field">
            <span>&nbsp;</span>
            <button className="button button-secondary" type="button" onClick={handleCreateType}>
              Create type
            </button>
          </div>
        </div>
        {complianceMessage ? <p className="status">{complianceMessage}</p> : null}
        {selectedDriverId && complianceRows.length === 0 ? <p className="status">No compliance records for selected driver.</p> : null}
        {complianceRows.length > 0 ? (
          <div className="table">
            <div className="table-row table-head drivers-table-row">
              <span>Type</span>
              <span>Expiry</span>
              <span>Status</span>
              <span>Reference</span>
            </div>
            {complianceRows.map((row) => (
              <div className="table-row drivers-table-row" key={row.id}>
                <span>{row.type.name}</span>
                <span>{row.expiry_date ?? '—'}</span>
                <span>{row.is_expired ? 'Expired' : row.is_expiring_soon ? 'Expiring soon' : 'Valid'}</span>
                <span>{row.reference_number ?? '—'}</span>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </TenantSidebarLayout>
  );
}
