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
  resetMasterDriverPassword,
  updateMasterDriver,
} from '../lib/api';
import { formatFleetCode, formatSiteDisplayName } from '../lib/display-format';
import { canManageMasterDataRole } from '../lib/roles';
import { getTenantRoleFromToken, getTenantTokenKey, type TenantStaffRole } from '../lib/tenant-session';
import { ScopeEmptyState } from './scope-empty-state';
import { TenantSidebarLayout } from './tenant-sidebar-layout';

interface TenantDriversPageProps {
  host: string | null;
  subdomain: string | null;
}

function optionalSites(
  promise: Promise<{ items: Array<{ id: string; site_code: string; site_name: string }> }>,
) {
  return promise.catch((error) => {
    if (error instanceof ApiClientError && error.code?.startsWith('forbidden_')) {
      return { items: [] };
    }
    throw error;
  });
}

export function TenantDriversPage({ host, subdomain }: TenantDriversPageProps) {
  const router = useRouter();
  const [rows, setRows] = useState<DriverLookupRecord[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [scopeStatus, setScopeStatus] = useState<ScopeStatus>('full_tenant_scope');
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [complianceTypes, setComplianceTypes] = useState<ComplianceTypeRecord[]>([]);
  const [complianceRows, setComplianceRows] = useState<ComplianceRecordItem[]>([]);
  const [complianceCategory, setComplianceCategory] = useState<'TRAINING' | 'COMPLIANCE'>('TRAINING');
  const [complianceName, setComplianceName] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [issuedAt, setIssuedAt] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [complianceMessage, setComplianceMessage] = useState<string | null>(null);
  const [sites, setSites] = useState<Array<{ id: string; site_code: string; site_name: string }>>([]);
  const [vehicles, setVehicles] = useState<Array<{ id: string; fleet_no: string; plate_no: string | null }>>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [profileDriverId, setProfileDriverId] = useState<string | null>(null);
  const [driverForm, setDriverForm] = useState({
    role: 'DRIVER' as 'DRIVER' | 'SITE_SUPERVISOR' | 'SAFETY_OFFICER' | 'TENANT_ADMIN',
    full_name: '',
    employee_no: '',
    username: '',
    site_id: '',
    site_ids: [] as string[],
    assigned_vehicle_id: '',
    is_active: true,
  });
  const [driverMessage, setDriverMessage] = useState<string | null>(null);
  const [resetCredential, setResetCredential] = useState<{ username: string | null; temporaryPassword: string } | null>(null);
  const [driverSaving, setDriverSaving] = useState(false);
  const [role, setRole] = useState<TenantStaffRole | null>(null);
  const canManageMasterData = canManageMasterDataRole(role);
  const assignableRoles: Array<'DRIVER' | 'SITE_SUPERVISOR' | 'SAFETY_OFFICER' | 'TENANT_ADMIN'> =
    role === 'TRANSPORT_MANAGER'
      ? ['DRIVER', 'SITE_SUPERVISOR', 'SAFETY_OFFICER', 'TENANT_ADMIN']
      : ['DRIVER', 'SITE_SUPERVISOR', 'SAFETY_OFFICER'];

  const canManageRow = (row: DriverLookupRecord) =>
    canManageMasterData &&
    row.role !== 'TRANSPORT_MANAGER' &&
    !(row.role === 'TENANT_ADMIN' && role !== 'TRANSPORT_MANAGER');

  async function refreshDriverData(currentSearch: string) {
    if (!host || !subdomain) {
      return;
    }
    const token = window.localStorage.getItem(getTenantTokenKey(subdomain));
    if (!token) {
      router.replace('/');
      return;
    }
    setRole(getTenantRoleFromToken(token));
    const [driversResult, typesResult, sitesResult, vehiclesResult] = await Promise.all([
      listMasterDrivers(host, token, { limit: '100', search: currentSearch || undefined }),
      listComplianceTypes(host, token, { applies_to: 'DRIVER' }),
      optionalSites(listTenantSites(host, token, { limit: '100' })),
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
    setRole(getTenantRoleFromToken(token));

    setLoading(true);
    setError(null);
    void Promise.all([
      listMasterDrivers(host, token, { limit: '100', search: search || undefined }),
      listComplianceTypes(host, token, { applies_to: 'DRIVER' }),
      optionalSites(listTenantSites(host, token, { limit: '100' })),
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
    if (!canManageMasterData) {
      return;
    }
    setEditingId('new');
    setSelectedDriverId('');
    setProfileDriverId(null);
    setDriverForm({
      role: 'DRIVER',
      full_name: '',
      employee_no: '',
      username: '',
      site_id: '',
      site_ids: [],
      assigned_vehicle_id: '',
      is_active: true,
    });
    setDriverMessage(null);
  }

  function startEdit(row: DriverLookupRecord) {
    if (!canManageMasterData) {
      return;
    }
    setEditingId(row.id);
    setSelectedDriverId(row.id);
    setProfileDriverId(null);
    setDriverForm({
      role: (row.role as 'DRIVER' | 'SITE_SUPERVISOR' | 'SAFETY_OFFICER' | 'TENANT_ADMIN') ?? 'DRIVER',
      full_name: row.full_name,
      employee_no: row.employee_no ?? '',
      username: row.username ?? '',
      site_id: row.site?.id ?? '',
      site_ids: row.site_ids ?? (row.site?.id ? [row.site.id] : []),
      assigned_vehicle_id: row.assigned_vehicle?.id ?? '',
      is_active: row.is_active ?? true,
    });
    setDriverMessage(null);
  }

  async function saveDriver() {
    if (!canManageMasterData) {
      setDriverMessage('Your role is read-only for driver updates.');
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
    setDriverSaving(true);
    setDriverMessage(null);
    try {
      if (editingId === 'new') {
        await createMasterDriver(host, token, {
          role: driverForm.role,
          full_name: driverForm.full_name.trim(),
          employee_no: driverForm.employee_no.trim() || null,
          username: driverForm.username.trim(),
          site_id: driverForm.role === 'SAFETY_OFFICER' ? null : driverForm.site_id || null,
          site_ids: driverForm.role === 'SAFETY_OFFICER' ? driverForm.site_ids : [],
          assigned_vehicle_id: driverForm.role === 'DRIVER' ? driverForm.assigned_vehicle_id || null : null,
          is_active: driverForm.is_active,
        });
        setDriverMessage('Driver created.');
      } else if (editingId) {
        await updateMasterDriver(host, token, editingId, {
          role: driverForm.role,
          full_name: driverForm.full_name.trim(),
          employee_no: driverForm.employee_no.trim() || null,
          username: driverForm.username.trim(),
          site_id: driverForm.role === 'SAFETY_OFFICER' ? null : driverForm.site_id || null,
          site_ids: driverForm.role === 'SAFETY_OFFICER' ? driverForm.site_ids : [],
          assigned_vehicle_id: driverForm.role === 'DRIVER' ? driverForm.assigned_vehicle_id || null : null,
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

  async function handleResetPassword(row: DriverLookupRecord) {
    if (!canManageRow(row) || !host || !subdomain) {
      return;
    }
    const token = window.localStorage.getItem(getTenantTokenKey(subdomain));
    if (!token) {
      router.replace('/');
      return;
    }
    setDriverSaving(true);
    setDriverMessage(null);
    setResetCredential(null);
    try {
      const response = await resetMasterDriverPassword(host, token, row.id);
      setResetCredential({
        username: response.username,
        temporaryPassword: response.temporary_password,
      });
      setDriverMessage('Temporary password generated. Share securely and require immediate password change.');
    } catch (caught) {
      setDriverMessage(caught instanceof ApiClientError ? caught.message : 'Unable to reset password.');
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

  const profileDriver = profileDriverId ? rows.find((item) => item.id === profileDriverId) ?? null : null;
  const visibleRows = showInactive ? rows : rows.filter((row) => row.is_active);

  function handleLogout() {
    if (subdomain) {
      window.localStorage.removeItem(getTenantTokenKey(subdomain));
    }
    setRole(null);
    router.replace('/');
  }

  function resetComplianceForm() {
    setComplianceCategory('TRAINING');
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
      applies_to: 'DRIVER',
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
    if (!host || !subdomain || !selectedDriverId || !complianceName.trim()) {
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
        applies_to: 'DRIVER',
        target_id: selectedDriverId,
        compliance_type_id: complianceTypeId,
        reference_number: referenceNumber || undefined,
        issued_at: issuedAt || undefined,
        expiry_date: expiryDate || undefined,
      });
      const records = await listComplianceRecords(host, token, { applies_to: 'DRIVER', driver_id: selectedDriverId });
      setComplianceRows(records.items);
      resetComplianceForm();
      setComplianceMessage('Driver compliance record saved.');
    } catch (caught) {
      const message = caught instanceof ApiClientError ? caught.message : 'Unable to save compliance record.';
      setComplianceMessage(message);
    }
  }

  return (
    <TenantSidebarLayout
      subdomain={subdomain ?? 'tenant'}
      role={role}
      title="Users"
      description="Operational user management with role-based access."
      onSignOut={handleLogout}
    >
      {scopeStatus === 'no_site_scope_assigned' ? <ScopeEmptyState /> : null}
      <section className="card" data-testid="drivers-monitoring-module">
        <div className="toolbar">
          <h2>Users</h2>
          <label className="field compact">
            <span>Search</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, role, employee, username" />
          </label>
          <label className="checkbox-field compact">
            <input checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} type="checkbox" />
            <span>Show inactive</span>
          </label>
          {canManageMasterData ? (
            <button className="button" type="button" onClick={startCreate}>
              Add user
            </button>
          ) : null}
        </div>
        {canManageMasterData && editingId === 'new' ? (
          <div className="inline-create-panel" data-testid="drivers-edit-form">
            <div className="inline-grid four master-form-grid">
              <label className="field">
                <span>Role</span>
                <select
                  value={driverForm.role}
                  onChange={(event) =>
                    setDriverForm((current) => ({
                      ...current,
                      role: event.target.value as 'DRIVER' | 'SITE_SUPERVISOR' | 'SAFETY_OFFICER' | 'TENANT_ADMIN',
                      site_id: event.target.value === 'TENANT_ADMIN' ? '' : current.site_id,
                      site_ids: event.target.value === 'SAFETY_OFFICER' ? current.site_ids : [],
                      assigned_vehicle_id: event.target.value === 'DRIVER' ? current.assigned_vehicle_id : '',
                    }))
                  }
                >
                  {assignableRoles.map((value) => (
                    <option key={value} value={value}>
                      {value === 'TENANT_ADMIN'
                        ? 'Admin'
                        : value === 'SITE_SUPERVISOR'
                          ? 'Site Supervisor'
                          : value === 'SAFETY_OFFICER'
                            ? 'Safety Officer'
                            : 'Driver'}
                    </option>
                  ))}
                </select>
              </label>
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
                <input
                  value={driverForm.username}
                  onChange={(event) =>
                    setDriverForm((current) => ({
                      ...current,
                      username: event.target.value.toLowerCase().replace(/\s+/g, ''),
                    }))
                  }
                />
              </label>
              {driverForm.role === 'SAFETY_OFFICER' ? (
                <label className="field">
                  <span>Assigned sites</span>
                  <select
                    multiple
                    value={driverForm.site_ids}
                    onChange={(event) =>
                      setDriverForm((current) => ({
                        ...current,
                        site_ids: Array.from(event.target.selectedOptions).map((option) => option.value),
                      }))
                    }
                  >
                    {sites.map((site) => (
                      <option key={site.id} value={site.id}>
                        {formatSiteDisplayName(site)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : driverForm.role === 'TENANT_ADMIN' ? (
                <label className="field">
                  <span>Scope</span>
                  <input value="Tenant-wide" readOnly />
                </label>
              ) : (
                <label className="field">
                  <span>Assigned site</span>
                  <select value={driverForm.site_id} onChange={(event) => setDriverForm((current) => ({ ...current, site_id: event.target.value }))}>
                    <option value="">Unassigned</option>
                    {sites.map((site) => (
                      <option key={site.id} value={site.id}>
                        {formatSiteDisplayName(site)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {driverForm.role === 'DRIVER' ? (
                <label className="field">
                  <span>Assigned vehicle</span>
                  <select
                    value={driverForm.assigned_vehicle_id}
                    onChange={(event) => setDriverForm((current) => ({ ...current, assigned_vehicle_id: event.target.value }))}
                  >
                    <option value="">Unassigned</option>
                    {vehicles.map((vehicle) => (
                      <option key={vehicle.id} value={vehicle.id}>
                        {formatFleetCode(vehicle.fleet_no)} {vehicle.plate_no ? `(${formatFleetCode(vehicle.plate_no)})` : ''}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={driverForm.is_active}
                  onChange={(event) => setDriverForm((current) => ({ ...current, is_active: event.target.checked }))}
                />
                <span>Active</span>
              </label>
              <div className="edit-actions">
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
        {loading ? <p className="status">Loading drivers...</p> : null}
        {error ? <p className="status error">{error}</p> : null}
        {!loading && !error && visibleRows.length === 0 ? <p className="status">No users found.</p> : null}
        {!loading && !error && visibleRows.length > 0 ? (
          <div className="table">
            <div className="table-row table-head drivers-master-row">
              <span>Full name</span>
              <span>Role</span>
              <span>Employee no</span>
              <span>Username</span>
              <span>Site</span>
              <span>Status</span>
              <span>{canManageMasterData ? 'Edit' : 'Actions'}</span>
            </div>
            {visibleRows.map((row) => (
              <Fragment key={row.id}>
                <div className={`table-row drivers-master-row ${editingId === row.id ? 'row-highlight' : ''}`}>
                  <span>
                    <button
                      className="profile-link-button"
                      type="button"
                      onClick={() => {
                        setProfileDriverId(row.id);
                        setSelectedDriverId(row.id);
                      }}
                    >
                      {row.full_name}
                    </button>
                  </span>
                  <span>{row.role ? row.role.replaceAll('_', ' ') : 'DRIVER'}</span>
                  <span>{row.employee_no ?? '—'}</span>
                  <span>{row.is_active ? row.username ?? '—' : '—'}</span>
                  <span>
                    {row.role === 'SAFETY_OFFICER' && row.site_ids && row.site_ids.length > 1
                      ? `${row.site_ids.length} sites`
                      : formatSiteDisplayName(row.site)}
                  </span>
                  <span>
                    <span className={`status-pill ${row.is_active ? 'good' : 'issue'}`}>
                      {row.is_active ? '🟢 Active' : '🔴 Inactive'}
                    </span>
                  </span>
                  <span className="edit-action-cell">
                    {canManageRow(row) ? (
                      <div className="inline-actions">
                        <button
                          aria-label={`Edit ${row.full_name}`}
                          className="button button-secondary edit-icon-button"
                          title="Edit driver"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            startEdit(row);
                          }}
                        >
                          ✎
                        </button>
                        <button
                          aria-label={`Reset password for ${row.full_name}`}
                          className="button button-secondary edit-icon-button"
                          title="Reset password"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleResetPassword(row);
                          }}
                        >
                          🔐
                        </button>
                      </div>
                    ) : (
                      '—'
                    )}
                  </span>
                </div>
                {canManageRow(row) && editingId === row.id ? (
                  <div className="table-row master-edit-row" data-testid="drivers-edit-form">
                    <div className="inline-grid four master-form-grid">
                      <label className="field">
                        <span>Role</span>
                        <select
                          value={driverForm.role}
                          onChange={(event) =>
                            setDriverForm((current) => ({
                              ...current,
                              role: event.target.value as 'DRIVER' | 'SITE_SUPERVISOR' | 'SAFETY_OFFICER' | 'TENANT_ADMIN',
                              site_id: event.target.value === 'TENANT_ADMIN' ? '' : current.site_id,
                              site_ids: event.target.value === 'SAFETY_OFFICER' ? current.site_ids : [],
                              assigned_vehicle_id: event.target.value === 'DRIVER' ? current.assigned_vehicle_id : '',
                            }))
                          }
                        >
                          {assignableRoles.map((value) => (
                            <option key={value} value={value}>
                              {value === 'TENANT_ADMIN'
                                ? 'Admin'
                                : value === 'SITE_SUPERVISOR'
                                  ? 'Site Supervisor'
                                  : value === 'SAFETY_OFFICER'
                                    ? 'Safety Officer'
                                    : 'Driver'}
                            </option>
                          ))}
                        </select>
                      </label>
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
                        <input
                          value={driverForm.username}
                          onChange={(event) =>
                            setDriverForm((current) => ({
                              ...current,
                              username: event.target.value.toLowerCase().replace(/\s+/g, ''),
                            }))
                          }
                        />
                      </label>
                      {driverForm.role === 'SAFETY_OFFICER' ? (
                        <label className="field">
                          <span>Assigned sites</span>
                          <select
                            multiple
                            value={driverForm.site_ids}
                            onChange={(event) =>
                              setDriverForm((current) => ({
                                ...current,
                                site_ids: Array.from(event.target.selectedOptions).map((option) => option.value),
                              }))
                            }
                          >
                            {sites.map((site) => (
                              <option key={site.id} value={site.id}>
                                {formatSiteDisplayName(site)}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : driverForm.role === 'TENANT_ADMIN' ? (
                        <label className="field">
                          <span>Scope</span>
                          <input value="Tenant-wide" readOnly />
                        </label>
                      ) : (
                        <label className="field">
                          <span>Assigned site</span>
                          <select value={driverForm.site_id} onChange={(event) => setDriverForm((current) => ({ ...current, site_id: event.target.value }))}>
                            <option value="">Unassigned</option>
                            {sites.map((site) => (
                              <option key={site.id} value={site.id}>
                                {formatSiteDisplayName(site)}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      {driverForm.role === 'DRIVER' ? (
                        <label className="field">
                          <span>Assigned vehicle</span>
                          <select
                            value={driverForm.assigned_vehicle_id}
                            onChange={(event) => setDriverForm((current) => ({ ...current, assigned_vehicle_id: event.target.value }))}
                          >
                            <option value="">Unassigned</option>
                            {vehicles.map((vehicle) => (
                              <option key={vehicle.id} value={vehicle.id}>
                                {formatFleetCode(vehicle.fleet_no)} {vehicle.plate_no ? `(${formatFleetCode(vehicle.plate_no)})` : ''}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                      <label className="checkbox-field">
                        <input
                          type="checkbox"
                          checked={driverForm.is_active}
                          onChange={(event) => setDriverForm((current) => ({ ...current, is_active: event.target.checked }))}
                        />
                        <span>Active</span>
                      </label>
                      <div className="edit-actions">
                        <button className="button" type="button" onClick={() => void saveDriver()} disabled={driverSaving}>
                          {driverSaving ? 'Saving…' : 'Save'}
                        </button>
                        <button className="button button-secondary" type="button" onClick={() => setEditingId(null)} disabled={driverSaving}>
                          Cancel
                        </button>
                      </div>
                    </div>
                    {driverForm.role === 'DRIVER' || driverForm.role === 'SITE_SUPERVISOR' ? (
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
                          placeholder="e.g. H2S, OPAL License"
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
                        <button className="button button-secondary" type="button" onClick={handleCreateRecord} disabled={!complianceName.trim()}>
                          Add training/certification
                        </button>
                      </div>
                    </div>
                    ) : null}
                    {complianceRows.length > 0 ? (
                      <div className="table">
                        <div className="table-row table-head drivers-table-row">
                          <span>Type</span>
                          <span>Expiry</span>
                          <span>Status</span>
                          <span>Reference</span>
                        </div>
                        {complianceRows.map((compliance) => (
                          <div className="table-row drivers-table-row" key={compliance.id}>
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
                      <p className="status">No training/certification records for this driver.</p>
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
        {driverMessage ? <p className={driverMessage.includes('Unable') ? 'status error' : 'status'}>{driverMessage}</p> : null}
        {resetCredential ? (
          <div className="status">
            <strong>Temporary credential:</strong>{' '}
            {resetCredential.username ?? 'user'} / <code>{resetCredential.temporaryPassword}</code>
          </div>
        ) : null}
      </section>
      {profileDriver ? (
        <aside className="profile-drawer" data-testid="user-profile-drawer">
          <div className="profile-drawer-header">
            <h3>User Profile</h3>
            <button
              aria-label="Close profile"
              className="button button-secondary"
              type="button"
              onClick={() => setProfileDriverId(null)}
            >
              Close
            </button>
          </div>
          <div className="profile-grid">
            <div>
              <span className="profile-label">Name</span>
              <strong>{profileDriver.full_name}</strong>
            </div>
            <div>
              <span className="profile-label">Role</span>
              <strong>{(profileDriver.role ?? 'DRIVER').replaceAll('_', ' ')}</strong>
            </div>
            <div>
              <span className="profile-label">Status</span>
              <strong>{profileDriver.is_active ? 'Active' : 'Inactive'}</strong>
            </div>
            <div>
              <span className="profile-label">Employer</span>
              <strong>{subdomain?.toUpperCase() ?? 'Tenant'}</strong>
            </div>
            <div>
              <span className="profile-label">Employee no / ID</span>
              <strong>{profileDriver.employee_no ?? '—'}</strong>
            </div>
            <div>
              <span className="profile-label">Username</span>
              <strong>{profileDriver.username ?? '—'}</strong>
            </div>
            <div>
              <span className="profile-label">Site</span>
              <strong>{formatSiteDisplayName(profileDriver.site)}</strong>
            </div>
            <div>
              <span className="profile-label">Assigned vehicle</span>
              <strong>
                {profileDriver.assigned_vehicle
                  ? `${formatFleetCode(profileDriver.assigned_vehicle.fleet_no)}`
                  : 'Unassigned'}
              </strong>
            </div>
          </div>
          <div className="profile-section">
            <h4>Training / Compliance</h4>
            {complianceRows.length === 0 ? <p className="status">No records.</p> : null}
            {complianceRows.length > 0 ? (
              <div className="table">
                <div className="table-row table-head drivers-table-row">
                  <span>Type</span>
                  <span>Expiry</span>
                  <span>Status</span>
                  <span>Reference</span>
                </div>
                {complianceRows.map((compliance) => (
                  <div className="table-row drivers-table-row" key={compliance.id}>
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
