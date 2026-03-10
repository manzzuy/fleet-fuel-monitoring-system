'use client';

import { Fragment, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { ComplianceRecordItem, ComplianceTypeRecord, VehicleLookupRecord } from '@fleet-fuel/shared';
import type { ScopeStatus } from '@fleet-fuel/shared';

import {
  ApiClientError,
  createMasterVehicle,
  createComplianceRecord,
  createComplianceType,
  listComplianceRecords,
  listComplianceTypes,
  listMasterDrivers,
  listMasterVehicles,
  listTenantSites,
  listTenantVehicles,
  updateMasterVehicle,
} from '../lib/api';
import { getTenantTokenKey } from '../lib/tenant-session';
import { ScopeEmptyState } from './scope-empty-state';
import { TenantSidebarLayout } from './tenant-sidebar-layout';

interface TenantVehiclesPageProps {
  host: string | null;
  subdomain: string | null;
}

export function TenantVehiclesPage({ host, subdomain }: TenantVehiclesPageProps) {
  const router = useRouter();
  const [rows, setRows] = useState<VehicleLookupRecord[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scopeStatus, setScopeStatus] = useState<ScopeStatus>('full_tenant_scope');
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
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
  const [drivers, setDrivers] = useState<Array<{ id: string; full_name: string }>>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [complianceEditingVehicleId, setComplianceEditingVehicleId] = useState<string | null>(null);
  const [vehicleForm, setVehicleForm] = useState({
    fleet_no: '',
    plate_no: '',
    site_id: '',
    assigned_driver_user_id: '',
    is_active: true,
  });
  const [vehicleMessage, setVehicleMessage] = useState<string | null>(null);
  const [vehicleSaving, setVehicleSaving] = useState(false);

  async function refreshVehicleData(currentSearch: string) {
    if (!host || !subdomain) {
      return;
    }
    const token = window.localStorage.getItem(getTenantTokenKey(subdomain));
    if (!token) {
      router.replace('/');
      return;
    }
    const [vehiclesResult, typesResult, sitesResult, driversResult] = await Promise.all([
      listMasterVehicles(host, token, { limit: '100', search: currentSearch || undefined }),
      listComplianceTypes(host, token, { applies_to: 'VEHICLE' }),
      listTenantSites(host, token, { limit: '100' }),
      listMasterDrivers(host, token, { limit: '100' }),
    ]);
    setRows(vehiclesResult.items);
    setScopeStatus(vehiclesResult.scope_status ?? 'full_tenant_scope');
    setComplianceTypes(typesResult.items.filter((item) => item.is_active));
    setSites(sitesResult.items);
    setDrivers(driversResult.items.map((item) => ({ id: item.id, full_name: item.full_name })));
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
      listMasterVehicles(host, token, { limit: '100', search: search || undefined }),
      listComplianceTypes(host, token, { applies_to: 'VEHICLE' }),
      listTenantSites(host, token, { limit: '100' }),
      listMasterDrivers(host, token, { limit: '100' }),
    ])
      .then(([vehiclesResult, typesResult, sitesResult, driversResult]) => {
        setRows(vehiclesResult.items);
        setScopeStatus(vehiclesResult.scope_status ?? 'full_tenant_scope');
        setComplianceTypes(typesResult.items.filter((item) => item.is_active));
        setSites(sitesResult.items);
        setDrivers(driversResult.items.map((item) => ({ id: item.id, full_name: item.full_name })));
      })
      .catch((caught) => {
        if (caught instanceof ApiClientError) {
          const message =
            caught.code === 'route_not_found'
              ? 'Vehicle endpoint is unavailable in the current API runtime. Restart the API server and retry.'
              : caught.message;
          setError(`${message}${caught.requestId ? ` (request_id: ${caught.requestId})` : ''}`);
          return;
        }
        setError(caught instanceof Error ? caught.message : 'Unable to load vehicles.');
      })
      .finally(() => setLoading(false));
  }, [host, router, search, subdomain]);

  function startCreate() {
    setEditingId('new');
    setVehicleForm({
      fleet_no: '',
      plate_no: '',
      site_id: '',
      assigned_driver_user_id: '',
      is_active: true,
    });
    setVehicleMessage(null);
  }

  function startEdit(row: VehicleLookupRecord) {
    setEditingId(row.id);
    setVehicleForm({
      fleet_no: row.fleet_no,
      plate_no: row.plate_no ?? '',
      site_id: row.site?.id ?? '',
      assigned_driver_user_id: row.assigned_driver?.user_id ?? '',
      is_active: row.is_active ?? true,
    });
    setVehicleMessage(null);
  }

  async function saveVehicle() {
    if (!host || !subdomain) {
      return;
    }
    const token = window.localStorage.getItem(getTenantTokenKey(subdomain));
    if (!token) {
      router.replace('/');
      return;
    }
    setVehicleSaving(true);
    setVehicleMessage(null);
    try {
      if (editingId === 'new') {
        await createMasterVehicle(host, token, {
          fleet_no: vehicleForm.fleet_no.trim(),
          plate_no: vehicleForm.plate_no.trim() || null,
          site_id: vehicleForm.site_id || null,
          assigned_driver_user_id: vehicleForm.assigned_driver_user_id || null,
          is_active: vehicleForm.is_active,
        });
        setVehicleMessage('Vehicle created.');
      } else if (editingId) {
        await updateMasterVehicle(host, token, editingId, {
          fleet_no: vehicleForm.fleet_no.trim(),
          plate_no: vehicleForm.plate_no.trim() || null,
          site_id: vehicleForm.site_id || null,
          assigned_driver_user_id: vehicleForm.assigned_driver_user_id || null,
          is_active: vehicleForm.is_active,
        });
        setVehicleMessage('Vehicle updated.');
      }
      setEditingId(null);
      await refreshVehicleData(search);
    } catch (caught) {
      setVehicleMessage(caught instanceof ApiClientError ? caught.message : 'Unable to save vehicle.');
    } finally {
      setVehicleSaving(false);
    }
  }

  useEffect(() => {
    if (!selectedVehicleId || !host || !subdomain) {
      setComplianceRows([]);
      return;
    }
    const token = window.localStorage.getItem(getTenantTokenKey(subdomain));
    if (!token) {
      return;
    }
    void listComplianceRecords(host, token, { applies_to: 'VEHICLE', vehicle_id: selectedVehicleId })
      .then((result) => setComplianceRows(result.items))
      .catch(() => setComplianceRows([]));
  }, [host, selectedVehicleId, subdomain]);

  useEffect(() => {
    if (!selectedVehicleId && rows.length > 0) {
      setSelectedVehicleId(rows[0]!.id);
    }
  }, [rows, selectedVehicleId]);

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
        applies_to: 'VEHICLE',
        requires_expiry: newTypeRequiresExpiry,
      });
      setComplianceTypes((prev) => [...prev, created.item].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedTypeId(created.item.id);
      setNewTypeName('');
      setComplianceMessage('Vehicle compliance type created.');
    } catch (caught) {
      const message = caught instanceof ApiClientError ? caught.message : 'Unable to create compliance type.';
      setComplianceMessage(message);
    }
  }

  async function handleCreateRecord() {
    if (!host || !subdomain || !selectedVehicleId || !selectedTypeId) {
      return;
    }
    const token = window.localStorage.getItem(getTenantTokenKey(subdomain));
    if (!token) {
      return;
    }
    setComplianceMessage(null);
    try {
      await createComplianceRecord(host, token, {
        applies_to: 'VEHICLE',
        target_id: selectedVehicleId,
        compliance_type_id: selectedTypeId,
        reference_number: referenceNumber || undefined,
        issued_at: issuedAt || undefined,
        expiry_date: expiryDate || undefined,
        notes: notes || undefined,
      });
      const records = await listComplianceRecords(host, token, { applies_to: 'VEHICLE', vehicle_id: selectedVehicleId });
      setComplianceRows(records.items);
      setReferenceNumber('');
      setIssuedAt('');
      setExpiryDate('');
      setNotes('');
      setComplianceMessage('Vehicle compliance record saved.');
      setComplianceEditingVehicleId(null);
    } catch (caught) {
      const message = caught instanceof ApiClientError ? caught.message : 'Unable to save compliance record.';
      setComplianceMessage(message);
    }
  }

  return (
    <TenantSidebarLayout
      subdomain={subdomain ?? 'tenant'}
      title="Vehicles monitoring"
      description="Vehicle list and operational context."
      onSignOut={handleLogout}
    >
      {scopeStatus === 'no_site_scope_assigned' ? <ScopeEmptyState /> : null}
      <section className="card" data-testid="vehicles-monitoring-module">
        <div className="toolbar">
          <h2>Vehicles</h2>
          <label className="field compact">
            <span>Search</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Fleet or plate" />
          </label>
          <button className="button" type="button" onClick={startCreate}>
            Add vehicle
          </button>
        </div>
        {editingId === 'new' ? (
          <div className="inline-create-panel" data-testid="vehicles-edit-form">
            <div className="inline-grid four master-form-grid">
              <label className="field">
                <span>Fleet no</span>
                <input value={vehicleForm.fleet_no} onChange={(event) => setVehicleForm((current) => ({ ...current, fleet_no: event.target.value }))} />
              </label>
              <label className="field">
                <span>Plate no</span>
                <input value={vehicleForm.plate_no} onChange={(event) => setVehicleForm((current) => ({ ...current, plate_no: event.target.value }))} />
              </label>
              <label className="field">
                <span>Assigned site</span>
                <select value={vehicleForm.site_id} onChange={(event) => setVehicleForm((current) => ({ ...current, site_id: event.target.value }))}>
                  <option value="">Unassigned</option>
                  {sites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.site_code} - {site.site_name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Assigned driver</span>
                <select
                  value={vehicleForm.assigned_driver_user_id}
                  onChange={(event) => setVehicleForm((current) => ({ ...current, assigned_driver_user_id: event.target.value }))}
                >
                  <option value="">Unassigned</option>
                  {drivers.map((driver) => (
                    <option key={driver.id} value={driver.id}>
                      {driver.full_name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={vehicleForm.is_active}
                  onChange={(event) => setVehicleForm((current) => ({ ...current, is_active: event.target.checked }))}
                />
                <span>Active</span>
              </label>
              <div className="edit-actions">
                <button className="button" type="button" onClick={() => void saveVehicle()} disabled={vehicleSaving}>
                  {vehicleSaving ? 'Saving…' : 'Save'}
                </button>
                <button className="button button-secondary" type="button" onClick={() => setEditingId(null)} disabled={vehicleSaving}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {loading ? <p className="status">Loading vehicles...</p> : null}
        {error ? <p className="status error">{error}</p> : null}
        {!loading && !error && rows.length === 0 ? <p className="status">No vehicles found.</p> : null}
        {!loading && !error && rows.length > 0 ? (
          <div className="table">
            <div className="table-row table-head vehicles-master-row">
              <span>Fleet no</span>
              <span>Plate no</span>
              <span>Site</span>
              <span>Status</span>
              <span>Edit</span>
              <span>Compliance</span>
            </div>
            {rows.map((row) => (
              <Fragment key={row.id}>
                <div className={`table-row vehicles-master-row ${editingId === row.id ? 'row-highlight' : ''}`}>
                  <span>{row.fleet_no}</span>
                  <span>{row.plate_no ?? '—'}</span>
                  <span>{row.site ? `${row.site.site_code} - ${row.site.site_name}` : '—'}</span>
                  <span>
                    <span className={`status-pill ${row.is_active ? 'good' : 'issue'}`}>
                      {row.is_active ? '🟢 Active' : '🔴 Inactive'}
                    </span>
                  </span>
                  <span className="edit-action-cell">
                    <button
                      aria-label={`Edit ${row.fleet_no}`}
                      className="button button-secondary edit-icon-button"
                      title="Edit vehicle"
                      type="button"
                      onClick={() => startEdit(row)}
                    >
                      ✎
                    </button>
                  </span>
                  <span>
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={() => {
                        setSelectedVehicleId(row.id);
                        setComplianceEditingVehicleId(row.id);
                      }}
                    >
                      Add inspection/compliance
                    </button>
                  </span>
                </div>
                {editingId === row.id ? (
                  <div className="table-row master-edit-row" data-testid="vehicles-edit-form">
                    <div className="inline-grid four master-form-grid">
                      <label className="field">
                        <span>Fleet no</span>
                        <input value={vehicleForm.fleet_no} onChange={(event) => setVehicleForm((current) => ({ ...current, fleet_no: event.target.value }))} />
                      </label>
                      <label className="field">
                        <span>Plate no</span>
                        <input value={vehicleForm.plate_no} onChange={(event) => setVehicleForm((current) => ({ ...current, plate_no: event.target.value }))} />
                      </label>
                      <label className="field">
                        <span>Assigned site</span>
                        <select value={vehicleForm.site_id} onChange={(event) => setVehicleForm((current) => ({ ...current, site_id: event.target.value }))}>
                          <option value="">Unassigned</option>
                          {sites.map((site) => (
                            <option key={site.id} value={site.id}>
                              {site.site_code} - {site.site_name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>Assigned driver</span>
                        <select
                          value={vehicleForm.assigned_driver_user_id}
                          onChange={(event) => setVehicleForm((current) => ({ ...current, assigned_driver_user_id: event.target.value }))}
                        >
                          <option value="">Unassigned</option>
                          {drivers.map((driver) => (
                            <option key={driver.id} value={driver.id}>
                              {driver.full_name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="checkbox-field">
                        <input
                          type="checkbox"
                          checked={vehicleForm.is_active}
                          onChange={(event) => setVehicleForm((current) => ({ ...current, is_active: event.target.checked }))}
                        />
                        <span>Active</span>
                      </label>
                      <div className="edit-actions">
                        <button className="button" type="button" onClick={() => void saveVehicle()} disabled={vehicleSaving}>
                          {vehicleSaving ? 'Saving…' : 'Save'}
                        </button>
                        <button className="button button-secondary" type="button" onClick={() => setEditingId(null)} disabled={vehicleSaving}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
                {complianceEditingVehicleId === row.id ? (
                  <div className="table-row master-edit-row" data-testid="vehicles-inline-compliance-form">
                    <div className="inline-grid four master-form-grid">
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
                      <label className="field">
                        <span>Expiry date</span>
                        <input type="date" value={expiryDate} onChange={(event) => setExpiryDate(event.target.value)} />
                      </label>
                      <label className="field">
                        <span>Notes</span>
                        <input value={notes} onChange={(event) => setNotes(event.target.value)} />
                      </label>
                      <div className="edit-actions">
                        <button className="button" type="button" onClick={() => void handleCreateRecord()} disabled={!selectedTypeId}>
                          Add inspection/compliance
                        </button>
                        <button
                          className="button button-secondary"
                          type="button"
                          onClick={() => setComplianceEditingVehicleId(null)}
                        >
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
        {vehicleMessage ? <p className={vehicleMessage.includes('Unable') ? 'status error' : 'status'}>{vehicleMessage}</p> : null}
      </section>
      <section className="card" data-testid="vehicles-compliance-module">
        <h2>Vehicle compliance records</h2>
        <p className="status">Use “Add inspection/compliance” on a vehicle row to add records inline.</p>
        <div className="inline-grid four">
          <label className="field">
            <span>Vehicle</span>
            <select value={selectedVehicleId} onChange={(event) => setSelectedVehicleId(event.target.value)}>
              <option value="">Select vehicle</option>
              {rows.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.fleet_no}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="inline-grid three">
          <label className="field">
            <span>New type name</span>
            <input
              value={newTypeName}
              onChange={(event) => setNewTypeName(event.target.value)}
              placeholder="e.g. Registration"
            />
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
        {selectedVehicleId && complianceRows.length === 0 ? <p className="status">No compliance records for selected vehicle.</p> : null}
        {complianceRows.length > 0 ? (
          <div className="table">
            <div className="table-row table-head vehicles-table-row">
              <span>Type</span>
              <span>Expiry</span>
              <span>Status</span>
              <span>Reference</span>
            </div>
            {complianceRows.map((row) => (
              <div className="table-row vehicles-table-row" key={row.id}>
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
