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
  listTenantSiteOptions,
  listTenantVehicles,
  updateMasterVehicle,
} from '../lib/api';
import { formatFleetCode, formatSiteDisplayName } from '../lib/display-format';
import { canManageMasterDataRole } from '../lib/roles';
import { buildTenantLoginPath, getTenantRoleFromToken, getTenantTokenKey, type TenantStaffRole } from '../lib/tenant-session';
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
  const [complianceCategory, setComplianceCategory] = useState<'TRAINING' | 'COMPLIANCE'>('COMPLIANCE');
  const [complianceName, setComplianceName] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [issuedAt, setIssuedAt] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [complianceMessage, setComplianceMessage] = useState<string | null>(null);
  const [sites, setSites] = useState<Array<{ id: string; site_code: string; site_name: string }>>([]);
  const [drivers, setDrivers] = useState<Array<{ id: string; full_name: string }>>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [profileVehicleId, setProfileVehicleId] = useState<string | null>(null);
  const [vehicleForm, setVehicleForm] = useState({
    fleet_no: '',
    plate_no: '',
    last_service_date: '',
    last_service_odometer_km: '',
    next_service_odometer_km: '',
    service_interval_km: '',
    site_id: '',
    assigned_driver_user_id: '',
    is_active: true,
  });
  const [vehicleMessage, setVehicleMessage] = useState<string | null>(null);
  const [vehicleSaving, setVehicleSaving] = useState(false);
  const [role, setRole] = useState<TenantStaffRole | null>(null);
  const canManageMasterData = canManageMasterDataRole(role);

  async function refreshVehicleData(currentSearch: string) {
    if (!host || !subdomain) {
      return;
    }
    const token = window.localStorage.getItem(getTenantTokenKey(subdomain));
    if (!token) {
      router.replace('/');
      return;
    }
    setRole(getTenantRoleFromToken(token));
    const [vehiclesResult, typesResult, sitesResult, driversResult] = await Promise.all([
      listMasterVehicles(host, token, { limit: '100', search: currentSearch || undefined }),
      listComplianceTypes(host, token, { applies_to: 'VEHICLE' }),
      listTenantSiteOptions(host, token, { limit: '100' }),
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
    setRole(getTenantRoleFromToken(token));

    setLoading(true);
    setError(null);
    void Promise.all([
      listMasterVehicles(host, token, { limit: '100', search: search || undefined }),
      listComplianceTypes(host, token, { applies_to: 'VEHICLE' }),
      listTenantSiteOptions(host, token, { limit: '100' }),
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
    if (!canManageMasterData) {
      return;
    }
    setEditingId('new');
    setSelectedVehicleId('');
    setProfileVehicleId(null);
    setVehicleForm({
      fleet_no: '',
      plate_no: '',
      last_service_date: '',
      last_service_odometer_km: '',
      next_service_odometer_km: '',
      service_interval_km: '',
      site_id: '',
      assigned_driver_user_id: '',
      is_active: true,
    });
    setVehicleMessage(null);
  }

  function startEdit(row: VehicleLookupRecord) {
    if (!canManageMasterData) {
      return;
    }
    setEditingId(row.id);
    setSelectedVehicleId(row.id);
    setProfileVehicleId(null);
    setVehicleForm({
      fleet_no: row.fleet_no,
      plate_no: row.plate_no ?? '',
      last_service_date: row.last_service_date ?? '',
      last_service_odometer_km: row.last_service_odometer_km?.toString() ?? '',
      next_service_odometer_km: row.next_service_odometer_km?.toString() ?? '',
      service_interval_km: row.service_interval_km?.toString() ?? '',
      site_id: row.site?.id ?? '',
      assigned_driver_user_id: row.assigned_driver?.user_id ?? '',
      is_active: row.is_active ?? true,
    });
    setVehicleMessage(null);
  }

  async function saveVehicle() {
    if (!canManageMasterData) {
      setVehicleMessage('Your role is read-only for vehicle updates.');
      return;
    }
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
          fleet_no: vehicleForm.fleet_no.trim().toUpperCase(),
          plate_no: vehicleForm.plate_no.trim() ? vehicleForm.plate_no.trim().toUpperCase() : null,
          last_service_date: vehicleForm.last_service_date || null,
          last_service_odometer_km: vehicleForm.last_service_odometer_km.trim()
            ? Number(vehicleForm.last_service_odometer_km)
            : null,
          next_service_odometer_km: vehicleForm.next_service_odometer_km.trim()
            ? Number(vehicleForm.next_service_odometer_km)
            : null,
          service_interval_km: vehicleForm.service_interval_km.trim() ? Number(vehicleForm.service_interval_km) : null,
          site_id: vehicleForm.site_id || null,
          assigned_driver_user_id: vehicleForm.assigned_driver_user_id || null,
          is_active: vehicleForm.is_active,
        });
        setVehicleMessage('Vehicle created.');
      } else if (editingId) {
        await updateMasterVehicle(host, token, editingId, {
          fleet_no: vehicleForm.fleet_no.trim().toUpperCase(),
          plate_no: vehicleForm.plate_no.trim() ? vehicleForm.plate_no.trim().toUpperCase() : null,
          last_service_date: vehicleForm.last_service_date || null,
          last_service_odometer_km: vehicleForm.last_service_odometer_km.trim()
            ? Number(vehicleForm.last_service_odometer_km)
            : null,
          next_service_odometer_km: vehicleForm.next_service_odometer_km.trim()
            ? Number(vehicleForm.next_service_odometer_km)
            : null,
          service_interval_km: vehicleForm.service_interval_km.trim() ? Number(vehicleForm.service_interval_km) : null,
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
    setRole(null);
    router.replace(buildTenantLoginPath(subdomain));
  }

  const selectedVehicle = selectedVehicleId ? rows.find((row) => row.id === selectedVehicleId) ?? null : null;
  const profileVehicle = profileVehicleId ? rows.find((row) => row.id === profileVehicleId) ?? null : null;

  function resetComplianceForm() {
    setComplianceCategory('COMPLIANCE');
    setComplianceName('');
    setReferenceNumber('');
    setIssuedAt('');
    setExpiryDate('');
  }

  async function resolveComplianceTypeId(tenantHost: string, token: string) {
    const normalizedName = complianceName.trim();
    if (!normalizedName) {
      return null;
    }
    const typeLabel = `${complianceCategory}: ${normalizedName}`;
    const existing = complianceTypes.find((item) => item.name.toLowerCase() === typeLabel.toLowerCase());
    if (existing) {
      return existing.id;
    }
    const created = await createComplianceType(tenantHost, token, {
      name: typeLabel,
      applies_to: 'VEHICLE',
      requires_expiry: true,
    });
    setComplianceTypes((prev) => [...prev, created.item].sort((a, b) => a.name.localeCompare(b.name)));
    return created.item.id;
  }

  async function handleCreateRecord() {
    if (!canManageMasterData) {
      setComplianceMessage('Your role is read-only for compliance updates.');
      return;
    }
    if (!host || !subdomain || !selectedVehicleId || !complianceName.trim()) {
      return;
    }
    const token = window.localStorage.getItem(getTenantTokenKey(subdomain));
    if (!token) {
      return;
    }
    setComplianceMessage(null);
    try {
      const complianceTypeId = await resolveComplianceTypeId(host, token);
      if (!complianceTypeId) {
        setComplianceMessage('Type name is required.');
        return;
      }
      await createComplianceRecord(host, token, {
        applies_to: 'VEHICLE',
        target_id: selectedVehicleId,
        compliance_type_id: complianceTypeId,
        reference_number: referenceNumber || undefined,
        issued_at: issuedAt || undefined,
        expiry_date: expiryDate || undefined,
      });
      const records = await listComplianceRecords(host, token, { applies_to: 'VEHICLE', vehicle_id: selectedVehicleId });
      setComplianceRows(records.items);
      resetComplianceForm();
      setComplianceMessage('Vehicle compliance record saved.');
    } catch (caught) {
      const message = caught instanceof ApiClientError ? caught.message : 'Unable to save compliance record.';
      setComplianceMessage(message);
    }
  }

  return (
    <TenantSidebarLayout
      subdomain={subdomain ?? 'tenant'}
      role={role}
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
          {canManageMasterData ? (
            <button className="button" type="button" onClick={startCreate}>
              Add vehicle
            </button>
          ) : null}
        </div>
        {canManageMasterData && editingId === 'new' ? (
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
                <span>Last Service Date</span>
                <input
                  type="date"
                  value={vehicleForm.last_service_date}
                  onChange={(event) => setVehicleForm((current) => ({ ...current, last_service_date: event.target.value }))}
                />
              </label>
              <label className="field">
                <span>Last Service KM</span>
                <input
                  type="number"
                  min={0}
                  value={vehicleForm.last_service_odometer_km}
                  onChange={(event) => setVehicleForm((current) => ({ ...current, last_service_odometer_km: event.target.value }))}
                />
              </label>
              <label className="field">
                <span>Next Service Due KM</span>
                <input
                  type="number"
                  min={0}
                  value={vehicleForm.next_service_odometer_km}
                  onChange={(event) => setVehicleForm((current) => ({ ...current, next_service_odometer_km: event.target.value }))}
                />
              </label>
              <label className="field">
                <span>Service Interval KM</span>
                <input
                  type="number"
                  min={0}
                  value={vehicleForm.service_interval_km}
                  onChange={(event) => setVehicleForm((current) => ({ ...current, service_interval_km: event.target.value }))}
                />
              </label>
              <label className="field">
                <span>Assigned site</span>
                <select value={vehicleForm.site_id} onChange={(event) => setVehicleForm((current) => ({ ...current, site_id: event.target.value }))}>
                  <option value="">Unassigned</option>
                  {sites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {formatSiteDisplayName(site)}
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
              <span>{canManageMasterData ? 'Edit' : 'Actions'}</span>
            </div>
            {rows.map((row) => (
              <Fragment key={row.id}>
                <div className={`table-row vehicles-master-row ${editingId === row.id ? 'row-highlight' : ''}`}>
                  <span>
                    <button
                      className="profile-link-button"
                      type="button"
                      onClick={() => {
                        setProfileVehicleId(row.id);
                        setSelectedVehicleId(row.id);
                      }}
                    >
                      {formatFleetCode(row.fleet_no)}
                    </button>
                  </span>
                  <span>{row.plate_no ? formatFleetCode(row.plate_no) : '—'}</span>
                  <span>{formatSiteDisplayName(row.site)}</span>
                  <span>
                    <span className={`status-pill ${row.is_active ? 'good' : 'issue'}`}>
                      {row.is_active ? '🟢 Active' : '🔴 Inactive'}
                    </span>
                  </span>
                  <span className="edit-action-cell">
                    {canManageMasterData ? (
                      <button
                        aria-label={`Edit ${row.fleet_no}`}
                        className="button button-secondary edit-icon-button"
                        title="Edit vehicle"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          startEdit(row);
                        }}
                      >
                        ✎
                      </button>
                    ) : (
                      '—'
                    )}
                  </span>
                </div>
                {canManageMasterData && editingId === row.id ? (
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
                        <span>Last Service Date</span>
                        <input
                          type="date"
                          value={vehicleForm.last_service_date}
                          onChange={(event) => setVehicleForm((current) => ({ ...current, last_service_date: event.target.value }))}
                        />
                      </label>
                      <label className="field">
                        <span>Last Service KM</span>
                        <input
                          type="number"
                          min={0}
                          value={vehicleForm.last_service_odometer_km}
                          onChange={(event) => setVehicleForm((current) => ({ ...current, last_service_odometer_km: event.target.value }))}
                        />
                      </label>
                      <label className="field">
                        <span>Next Service Due KM</span>
                        <input
                          type="number"
                          min={0}
                          value={vehicleForm.next_service_odometer_km}
                          onChange={(event) => setVehicleForm((current) => ({ ...current, next_service_odometer_km: event.target.value }))}
                        />
                      </label>
                      <label className="field">
                        <span>Service Interval KM</span>
                        <input
                          type="number"
                          min={0}
                          value={vehicleForm.service_interval_km}
                          onChange={(event) => setVehicleForm((current) => ({ ...current, service_interval_km: event.target.value }))}
                        />
                      </label>
                      <label className="field">
                        <span>Assigned site</span>
                        <select value={vehicleForm.site_id} onChange={(event) => setVehicleForm((current) => ({ ...current, site_id: event.target.value }))}>
                          <option value="">Unassigned</option>
                          {sites.map((site) => (
                            <option key={site.id} value={site.id}>
                              {formatSiteDisplayName(site)}
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
                    <div className="inline-grid four master-form-grid">
                      <label className="field">
                        <span>Type</span>
                        <select value={complianceCategory} onChange={(event) => setComplianceCategory(event.target.value as 'TRAINING' | 'COMPLIANCE')}>
                          <option value="TRAINING">Training</option>
                          <option value="COMPLIANCE">Compliance</option>
                        </select>
                      </label>
                      <label className="field">
                        <span>Name</span>
                        <input
                          value={complianceName}
                          onChange={(event) => setComplianceName(event.target.value)}
                          placeholder="e.g. Registration, Inspection"
                        />
                      </label>
                      <label className="field">
                        <span>Issue Date</span>
                        <input type="date" value={issuedAt} onChange={(event) => setIssuedAt(event.target.value)} />
                      </label>
                      <label className="field">
                        <span>Expiry Date</span>
                        <input type="date" value={expiryDate} onChange={(event) => setExpiryDate(event.target.value)} />
                      </label>
                      <label className="field">
                        <span>Reference No. (optional)</span>
                        <input value={referenceNumber} onChange={(event) => setReferenceNumber(event.target.value)} />
                      </label>
                      <div className="edit-actions">
                        <button className="button button-secondary" type="button" onClick={() => void handleCreateRecord()} disabled={!complianceName.trim()}>
                          Add inspection/compliance
                        </button>
                      </div>
                    </div>
                    {complianceRows.length > 0 ? (
                      <div className="table">
                        <div className="table-row table-head vehicles-table-row">
                          <span>Type</span>
                          <span>Expiry</span>
                          <span>Status</span>
                          <span>Reference</span>
                        </div>
                        {complianceRows.map((compliance) => (
                          <div className="table-row vehicles-table-row" key={compliance.id}>
                            <span>{compliance.type.name}</span>
                            <span>{compliance.expiry_date ?? '—'}</span>
                            <span>
                              {compliance.is_expired ? 'Expired' : compliance.is_expiring_soon ? 'Expiring soon' : 'Valid'}
                            </span>
                            <span>{compliance.reference_number ?? '—'}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="status">No inspection/compliance records for this vehicle.</p>
                    )}
                    {complianceMessage ? (
                      <p className={complianceMessage.toLowerCase().includes('unable') ? 'status error' : 'status'}>{complianceMessage}</p>
                    ) : null}
                  </div>
                ) : null}
              </Fragment>
            ))}
          </div>
        ) : null}
        {vehicleMessage ? <p className={vehicleMessage.includes('Unable') ? 'status error' : 'status'}>{vehicleMessage}</p> : null}
      </section>
      <section className="card" data-testid="vehicles-maintenance-module">
        <h2>Maintenance &amp; Service</h2>
        {!selectedVehicleId ? <p className="status">Select a vehicle to view maintenance details.</p> : null}
        {selectedVehicleId && !selectedVehicle ? <p className="status">Selected vehicle not found.</p> : null}
        {selectedVehicle ? (
          <div className="table">
            <div className="table-row vehicles-table-row">
              <span>Vehicle</span>
              <span>{formatFleetCode(selectedVehicle.fleet_no)}</span>
            </div>
            <div className="table-row vehicles-table-row">
              <span>Last Service Date</span>
              <span>{selectedVehicle.last_service_date ?? '—'}</span>
            </div>
            <div className="table-row vehicles-table-row">
              <span>Last Service KM</span>
              <span>{selectedVehicle.last_service_odometer_km ?? '—'}</span>
            </div>
            <div className="table-row vehicles-table-row">
              <span>Next Service Due KM</span>
              <span>{selectedVehicle.next_service_odometer_km ?? '—'}</span>
            </div>
            <div className="table-row vehicles-table-row">
              <span>Service Interval KM</span>
              <span>{selectedVehicle.service_interval_km ?? '—'}</span>
            </div>
          </div>
        ) : null}
      </section>
      {profileVehicle ? (
        <aside className="profile-drawer" data-testid="vehicle-profile-drawer">
          <div className="profile-drawer-header">
            <h3>Vehicle Profile</h3>
            <button
              aria-label="Close profile"
              className="button button-secondary"
              type="button"
              onClick={() => setProfileVehicleId(null)}
            >
              Close
            </button>
          </div>
          <div className="profile-grid">
            <div>
              <span className="profile-label">Vehicle code</span>
              <strong>{formatFleetCode(profileVehicle.fleet_no)}</strong>
            </div>
            <div>
              <span className="profile-label">Plate</span>
              <strong>{profileVehicle.plate_no ? formatFleetCode(profileVehicle.plate_no) : '—'}</strong>
            </div>
            <div>
              <span className="profile-label">Site</span>
              <strong>{formatSiteDisplayName(profileVehicle.site)}</strong>
            </div>
            <div>
              <span className="profile-label">Asset type</span>
              <strong>Vehicle</strong>
            </div>
            <div>
              <span className="profile-label">Owner</span>
              <strong>{subdomain?.toUpperCase() ?? 'Tenant'}</strong>
            </div>
            <div>
              <span className="profile-label">Assigned driver</span>
              <strong>{profileVehicle.assigned_driver?.full_name ?? 'Unassigned'}</strong>
            </div>
            <div>
              <span className="profile-label">Odometer</span>
              <strong>{profileVehicle.last_service_odometer_km ?? '—'} km</strong>
            </div>
            <div>
              <span className="profile-label">Status</span>
              <strong>{profileVehicle.is_active ? 'Active' : 'Inactive'}</strong>
            </div>
            <div>
              <span className="profile-label">Last service date</span>
              <strong>{profileVehicle.last_service_date ?? '—'}</strong>
            </div>
            <div>
              <span className="profile-label">Next service due km</span>
              <strong>{profileVehicle.next_service_odometer_km ?? '—'}</strong>
            </div>
            <div>
              <span className="profile-label">Service interval km</span>
              <strong>{profileVehicle.service_interval_km ?? '—'}</strong>
            </div>
          </div>
          <div className="profile-section">
            <h4>Compliance / Inspection</h4>
            {complianceRows.length === 0 ? <p className="status">No records.</p> : null}
            {complianceRows.length > 0 ? (
              <div className="table">
                <div className="table-row table-head vehicles-table-row">
                  <span>Type</span>
                  <span>Expiry</span>
                  <span>Status</span>
                  <span>Reference</span>
                </div>
                {complianceRows.map((compliance) => (
                  <div className="table-row vehicles-table-row" key={compliance.id}>
                    <span>{compliance.type.name}</span>
                    <span>{compliance.expiry_date ?? '—'}</span>
                    <span>{compliance.is_expired ? 'Expired' : compliance.is_expiring_soon ? 'Expiring soon' : 'Valid'}</span>
                    <span>{compliance.reference_number ?? '—'}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </aside>
      ) : null}
    </TenantSidebarLayout>
  );
}
