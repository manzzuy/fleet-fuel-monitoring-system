'use client';

import { useEffect, useState } from 'react';

import type {
  OnboardingPreflightResponse,
  OnboardingPreviewResponse,
  OperatorAssistantResponse,
  PlatformSupportTenantUserRecord,
  PlatformTenantRecord,
} from '@fleet-fuel/shared';

import {
  ApiClientError,
  askPlatformOperatorAssistant,
  commitOnboardingBatch,
  createOnboardingBatch,
  createTenant,
  enterPlatformSupportMode,
  fetchOnboardingPreview,
  listTenants,
  listPlatformSupportTenantUsers,
  onboardingPreflight,
  platformLogin,
  resetPlatformSupportTenantUserAccount,
  updatePlatformSupportTenantUser,
  uploadOnboardingWorkbook,
} from '../lib/api';
import { appConfig } from '../lib/config';
import { buildTenantAdminUrl } from '../lib/tenant';

const previewSheets = [
  'Sites',
  'Drivers',
  'Vehicles_Cards',
  'Driver_Compliance',
  'Supervisor_Sites',
  'Tanks',
  'Equipment',
] as Array<keyof OnboardingPreviewResponse['sheets']>;

function tokenHasSupportMode(token: string): boolean {
  try {
    const payload = token.split('.')[1];
    if (!payload) {
      return false;
    }
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const json = JSON.parse(window.atob(padded));
    return json?.support_mode === true;
  } catch {
    return false;
  }
}

export function PlatformConsole() {
  const [token, setToken] = useState<string | null>(null);
  const [supportMode, setSupportMode] = useState(false);
  const [supportBusy, setSupportBusy] = useState(false);
  const [supportError, setSupportError] = useState<string | null>(null);
  const [supportSuccess, setSupportSuccess] = useState<string | null>(null);
  const [supportUsers, setSupportUsers] = useState<PlatformSupportTenantUserRecord[]>([]);
  const [supportSelectedUserId, setSupportSelectedUserId] = useState('');
  const [supportRole, setSupportRole] = useState<PlatformSupportTenantUserRecord['role']>('DRIVER');
  const [supportFullName, setSupportFullName] = useState('');
  const [supportUsername, setSupportUsername] = useState('');
  const [supportEmployeeNo, setSupportEmployeeNo] = useState('');
  const [supportEmail, setSupportEmail] = useState('');
  const [supportSiteId, setSupportSiteId] = useState('');
  const [supportSiteIds, setSupportSiteIds] = useState('');
  const [supportAssignedVehicleId, setSupportAssignedVehicleId] = useState('');
  const [supportIsActive, setSupportIsActive] = useState(true);
  const [supportResetPassword, setSupportResetPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [tenantError, setTenantError] = useState<string | null>(null);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const [loadingTenants, setLoadingTenants] = useState(false);
  const [tenants, setTenants] = useState<PlatformTenantRecord[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [tenantSubdomain, setTenantSubdomain] = useState('');
  const [createInitialAdmin, setCreateInitialAdmin] = useState(true);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminFullName, setAdminFullName] = useState('');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [workbookFile, setWorkbookFile] = useState<File | null>(null);
  const [currentBatchId, setCurrentBatchId] = useState<string | null>(null);
  const [preview, setPreview] = useState<OnboardingPreviewResponse | null>(null);
  const [activePreviewSheet, setActivePreviewSheet] =
    useState<keyof OnboardingPreviewResponse['sheets']>('Sites');
  const [onboardingBusy, setOnboardingBusy] = useState(false);
  const [onboardingSuccess, setOnboardingSuccess] = useState<string | null>(null);
  const [preflight, setPreflight] = useState<OnboardingPreflightResponse | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [preflightError, setPreflightError] = useState<string | null>(null);
  const [operatorQuestion, setOperatorQuestion] = useState('');
  const [operatorResponse, setOperatorResponse] = useState<OperatorAssistantResponse | null>(null);
  const [operatorLoading, setOperatorLoading] = useState(false);
  const [operatorError, setOperatorError] = useState<string | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem('platform_access_token');
    if (stored) {
      setToken(stored);
      setSupportMode(tokenHasSupportMode(stored));
    }
  }, []);

  useEffect(() => {
    if (!token) {
      setSupportMode(false);
      setTenants([]);
      setPreflight(null);
      setPreflightError(null);
      setSupportUsers([]);
      setSupportSelectedUserId('');
      return;
    }

    setSupportMode(tokenHasSupportMode(token));

    void refreshTenants(token);
    void loadPreflight(token);
  }, [token]);

  useEffect(() => {
    if (!token || !selectedTenantId) {
      return;
    }

    void loadPreflight(token);
  }, [token, selectedTenantId]);

  useEffect(() => {
    if (!token || !supportMode || !selectedTenantId) {
      return;
    }

    void loadSupportUsers(token, selectedTenantId);
  }, [token, supportMode, selectedTenantId]);

  async function loadPreflight(accessToken: string) {
    setPreflightLoading(true);
    setPreflightError(null);

    try {
      const result = await onboardingPreflight(accessToken);
      setPreflight(result);
    } catch (error) {
      setPreflightError(error instanceof Error ? error.message : 'Unable to check DB onboarding readiness.');
      setPreflight(null);
    } finally {
      setPreflightLoading(false);
    }
  }

  function toUiErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof ApiClientError) {
      if (error.code === 'db_not_migrated') {
        return `${error.message}${error.hint ? ` ${error.hint}` : ''}`;
      }

      if (error.code === 'route_not_found') {
        return 'API route not found. Restart the API from this repo (`pnpm -C apps/api dev` or `make api`) and retry.';
      }

      if (error.code === 'internal_error') {
        return `${error.message}${error.requestId ? ` (request_id: ${error.requestId})` : ''}`;
      }

      return `${error.message}${error.requestId ? ` (request_id: ${error.requestId})` : ''}`;
    }

    return error instanceof Error ? error.message : fallback;
  }

  async function refreshTenants(accessToken: string) {
    setLoadingTenants(true);
    setTenantError(null);

    try {
      const response = await listTenants(accessToken);
      setTenants(response.items);
      const firstTenant = response.items[0];
      if (!selectedTenantId && firstTenant) {
        setSelectedTenantId(firstTenant.id);
      }
    } catch (error) {
      setTenantError(error instanceof Error ? error.message : 'Unable to load tenants.');
    } finally {
      setLoadingTenants(false);
    }
  }

  function hydrateSupportForm(user: PlatformSupportTenantUserRecord) {
    setSupportSelectedUserId(user.id);
    setSupportRole(user.role);
    setSupportFullName(user.full_name);
    setSupportUsername(user.username ?? '');
    setSupportEmployeeNo(user.employee_no ?? '');
    setSupportEmail(user.email ?? '');
    setSupportSiteId(user.site_id ?? '');
    setSupportSiteIds(user.site_ids.join(','));
    setSupportAssignedVehicleId(user.assigned_vehicle_id ?? '');
    setSupportIsActive(user.is_active);
    setSupportResetPassword('');
  }

  async function loadSupportUsers(accessToken: string, tenantId: string) {
    setSupportBusy(true);
    setSupportError(null);
    setSupportSuccess(null);

    try {
      const response = await listPlatformSupportTenantUsers(accessToken, tenantId);
      setSupportUsers(response.items);
      const selected = response.items.find((item) => item.id === supportSelectedUserId) ?? response.items[0];
      if (selected) {
        hydrateSupportForm(selected);
      } else {
        setSupportSelectedUserId('');
      }
    } catch (error) {
      setSupportError(error instanceof Error ? error.message : 'Unable to load tenant users for support mode.');
    } finally {
      setSupportBusy(false);
    }
  }

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginError(null);

    try {
      const response = await platformLogin({ email, password });
      window.localStorage.setItem('platform_access_token', response.access_token);
      setToken(response.access_token);
      setSupportMode(Boolean(response.support_mode));
      setPassword('');
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Platform login failed.');
    }
  }

  async function handleCreateTenant(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token) {
      setTenantError('Platform login is required before creating a tenant.');
      return;
    }

    setTenantError(null);
    setSuccessMessage(null);

    try {
      const tenant = await createTenant(token, {
        tenantName,
        subdomain: tenantSubdomain,
        createInitialAdmin,
        initialAdmin: createInitialAdmin
          ? {
              email: adminEmail || undefined,
              username: adminUsername,
              password: adminPassword,
              fullName: adminFullName,
            }
          : undefined,
      });
      setTenants((current) => [tenant, ...current]);
      setTenantName('');
      setTenantSubdomain('');
      setAdminEmail('');
      setAdminUsername('');
      setAdminPassword('');
      setAdminFullName('');
      setSelectedTenantId(tenant.id);
      setSuccessMessage(
        `Tenant created. Open ${buildTenantAdminUrl(tenant.primary_subdomain)} to sign in on the tenant subdomain.`,
      );
    } catch (error) {
      setTenantError(error instanceof Error ? error.message : 'Unable to create tenant.');
    }
  }

  function handleLogout() {
    window.localStorage.removeItem('platform_access_token');
    setToken(null);
    setSupportMode(false);
    setSupportError(null);
    setSupportSuccess(null);
    setTenants([]);
    setPreview(null);
    setCurrentBatchId(null);
    setWorkbookFile(null);
  }

  async function handleUploadAndPreview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token) {
      setOnboardingError('Platform login is required.');
      return;
    }

    if (!selectedTenantId) {
      setOnboardingError('Select a tenant first.');
      return;
    }

    if (!workbookFile) {
      setOnboardingError('Select an .xlsx workbook file.');
      return;
    }

    if (preflight && !preflight.db.ready) {
      setOnboardingError('DB not ready for onboarding. Run: cd apps/api && pnpm prisma migrate deploy');
      return;
    }

    setOnboardingError(null);
    setOnboardingSuccess(null);
    setOnboardingBusy(true);

    try {
      const batch = await createOnboardingBatch(token, {
        company_id: selectedTenantId,
      });
      setCurrentBatchId(batch.id);

      await uploadOnboardingWorkbook(token, batch.id, workbookFile);
      const previewResponse = await fetchOnboardingPreview(token, batch.id);
      setPreview(previewResponse);
      setActivePreviewSheet('Sites');
    } catch (error) {
      if (error instanceof ApiClientError && error.code === 'onboarding_validation_failed') {
        const details = (error.details as { preview?: OnboardingPreviewResponse } | undefined)?.preview;
        if (details) {
          setPreview(details);
          setActivePreviewSheet('Sites');
        }
      }

      setOnboardingError(toUiErrorMessage(error, 'Onboarding upload failed.'));
      if (error instanceof ApiClientError && error.code === 'db_not_migrated') {
        await loadPreflight(token);
      }
    } finally {
      setOnboardingBusy(false);
    }
  }

  async function handleCommitOnboarding() {
    if (!token || !currentBatchId) {
      setOnboardingError('Create and preview a batch before commit.');
      return;
    }

    setOnboardingBusy(true);
    setOnboardingError(null);
    setOnboardingSuccess(null);

    try {
      const committed = await commitOnboardingBatch(token, currentBatchId);
      const tenant = tenants.find((entry) => entry.id === selectedTenantId);
      const tenantUrl = tenant ? buildTenantAdminUrl(tenant.primary_subdomain) : '';
      setOnboardingSuccess(
        `Committed batch ${committed.batch_id}. Sites: ${committed.summary.sites}, Vehicles: ${committed.summary.vehicles}, Drivers: ${committed.summary.drivers}, Fuel Cards: ${committed.summary.fuel_cards}. ${tenantUrl ? `Tenant login: ${tenantUrl}` : ''}`,
      );
    } catch (error) {
      setOnboardingError(toUiErrorMessage(error, 'Onboarding commit failed.'));
    } finally {
      setOnboardingBusy(false);
    }
  }

  async function handleAskOperator(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token) {
      setOperatorError('Platform login is required.');
      return;
    }

    setOperatorLoading(true);
    setOperatorError(null);
    setOperatorResponse(null);

    try {
      const activeTenant = tenants.find((entry) => entry.id === selectedTenantId);
      const response = await askPlatformOperatorAssistant(token, {
        question: operatorQuestion,
        ...(activeTenant?.primary_subdomain ? { tenant_subdomain: activeTenant.primary_subdomain } : {}),
      });
      setOperatorResponse(response);
    } catch (error) {
      setOperatorError(error instanceof Error ? error.message : 'Unable to get operator guidance.');
    } finally {
      setOperatorLoading(false);
    }
  }

  async function handleEnterSupportMode() {
    if (!token) {
      return;
    }

    setSupportBusy(true);
    setSupportError(null);
    setSupportSuccess(null);

    try {
      const response = await enterPlatformSupportMode(token);
      window.localStorage.setItem('platform_access_token', response.access_token);
      setToken(response.access_token);
      setSupportMode(true);
      setSupportSuccess('Support mode enabled. Tenant user support actions are now available and fully audited.');
    } catch (error) {
      setSupportError(error instanceof Error ? error.message : 'Unable to enter support mode.');
    } finally {
      setSupportBusy(false);
    }
  }

  async function handleSaveSupportUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token || !selectedTenantId || !supportSelectedUserId) {
      return;
    }

    setSupportBusy(true);
    setSupportError(null);
    setSupportSuccess(null);

    try {
      const siteIds = supportSiteIds
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      await updatePlatformSupportTenantUser(token, selectedTenantId, supportSelectedUserId, {
        role: supportRole,
        full_name: supportFullName,
        username: supportUsername || null,
        employee_no: supportEmployeeNo || null,
        email: supportEmail || null,
        is_active: supportIsActive,
        site_id: supportSiteId || null,
        site_ids: siteIds,
        assigned_vehicle_id: supportAssignedVehicleId || null,
      });
      await loadSupportUsers(token, selectedTenantId);
      setSupportSuccess('Support update saved and audited.');
    } catch (error) {
      setSupportError(error instanceof Error ? error.message : 'Unable to save support changes.');
    } finally {
      setSupportBusy(false);
    }
  }

  async function handleResetSupportAccount() {
    if (!token || !selectedTenantId || !supportSelectedUserId || !supportResetPassword) {
      return;
    }

    setSupportBusy(true);
    setSupportError(null);
    setSupportSuccess(null);

    try {
      await resetPlatformSupportTenantUserAccount(token, selectedTenantId, supportSelectedUserId, {
        password: supportResetPassword,
      });
      setSupportResetPassword('');
      setSupportSuccess('Account password reset completed and audited.');
    } catch (error) {
      setSupportError(error instanceof Error ? error.message : 'Unable to reset account.');
    } finally {
      setSupportBusy(false);
    }
  }

  const activeSheet = preview ? preview.sheets[activePreviewSheet] : null;

  return (
    <>
      <section className="hero">
        <p className="eyebrow">Platform bootstrap</p>
        <h1>Fleet Fuel Platform Owner Console</h1>
        <p>
          The system starts empty. Platform owner login is required to create the first tenant and begin
          onboarding.
        </p>
      </section>

      {!token ? (
        <section className="card">
          <h2>Platform login</h2>
          <form className="stack" onSubmit={handleLogin}>
            <label className="field">
              <span>Email</span>
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            <button className="button" type="submit">
              Sign in
            </button>
            {loginError ? <p className="status error">{loginError}</p> : null}
          </form>
        </section>
      ) : (
        <>
          <section className="card">
            <div className="toolbar">
              <div>
                <h2>Platform support override</h2>
                <p>
                  Hidden break-glass support mode for platform operations only. All support mode entries and tenant
                  user changes are audited.
                </p>
              </div>
              {!supportMode ? (
                <button className="button button-secondary" type="button" onClick={handleEnterSupportMode} disabled={supportBusy}>
                  Enter Support Mode
                </button>
              ) : (
                <span className="status">Support mode active</span>
              )}
            </div>
            {supportError ? <p className="status error">{supportError}</p> : null}
            {supportSuccess ? <p className="status">{supportSuccess}</p> : null}
          </section>

          {supportMode ? (
            <section className="card" data-testid="platform-support-mode-panel">
              <h2>Support mode: tenant user recovery</h2>
              <p>Use this only for support and pilot setup. Every update writes an audit log entry.</p>
              <div className="stack">
                <label className="field">
                  <span>Target tenant</span>
                  <select
                    value={selectedTenantId}
                    onChange={(event) => setSelectedTenantId(event.target.value)}
                    required
                  >
                    <option value="">Select tenant</option>
                    {tenants.map((tenant) => (
                      <option key={tenant.id} value={tenant.id}>
                        {tenant.name} ({tenant.primary_subdomain})
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => (token && selectedTenantId ? void loadSupportUsers(token, selectedTenantId) : undefined)}
                  disabled={!selectedTenantId || supportBusy}
                >
                  {supportBusy ? 'Loading…' : 'Load tenant users'}
                </button>
                {supportUsers.length > 0 ? (
                  <label className="field">
                    <span>User</span>
                    <select
                      value={supportSelectedUserId}
                      onChange={(event) => {
                        const next = supportUsers.find((item) => item.id === event.target.value);
                        if (next) {
                          hydrateSupportForm(next);
                        } else {
                          setSupportSelectedUserId(event.target.value);
                        }
                      }}
                      required
                    >
                      {supportUsers.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.full_name} ({user.role}){user.username ? ` - ${user.username}` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {supportSelectedUserId ? (
                  <form className="stack" onSubmit={handleSaveSupportUser}>
                    <label className="field">
                      <span>Role</span>
                      <select
                        value={supportRole}
                        onChange={(event) => setSupportRole(event.target.value as PlatformSupportTenantUserRecord['role'])}
                      >
                        <option value="TRANSPORT_MANAGER">Transport Manager</option>
                        <option value="TENANT_ADMIN">Tenant Admin</option>
                        <option value="SITE_SUPERVISOR">Site Supervisor</option>
                        <option value="SAFETY_OFFICER">Safety Officer</option>
                        <option value="DRIVER">Driver</option>
                        <option value="COMPANY_ADMIN">Company Admin</option>
                        <option value="SUPERVISOR">Supervisor</option>
                        <option value="HEAD_OFFICE_ADMIN">Head Office Admin</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>Full name</span>
                      <input value={supportFullName} onChange={(event) => setSupportFullName(event.target.value)} required />
                    </label>
                    <label className="field">
                      <span>Username</span>
                      <input value={supportUsername} onChange={(event) => setSupportUsername(event.target.value)} required />
                    </label>
                    <label className="field">
                      <span>Email</span>
                      <input value={supportEmail} onChange={(event) => setSupportEmail(event.target.value)} placeholder="optional" />
                    </label>
                    <label className="field">
                      <span>Employee No</span>
                      <input value={supportEmployeeNo} onChange={(event) => setSupportEmployeeNo(event.target.value)} />
                    </label>
                    <label className="field">
                      <span>Primary site ID (single-site roles)</span>
                      <input value={supportSiteId} onChange={(event) => setSupportSiteId(event.target.value)} />
                    </label>
                    <label className="field">
                      <span>Site IDs (comma-separated for Safety Officer)</span>
                      <input
                        value={supportSiteIds}
                        onChange={(event) => setSupportSiteIds(event.target.value)}
                        placeholder="uuid-1,uuid-2"
                      />
                    </label>
                    <label className="field">
                      <span>Assigned vehicle ID (Driver only)</span>
                      <input
                        value={supportAssignedVehicleId}
                        onChange={(event) => setSupportAssignedVehicleId(event.target.value)}
                      />
                    </label>
                    <label className="checkbox-field">
                      <input
                        type="checkbox"
                        checked={supportIsActive}
                        onChange={(event) => setSupportIsActive(event.target.checked)}
                      />
                      <span>Account active</span>
                    </label>
                    <button className="button" type="submit" disabled={supportBusy}>
                      Save support changes
                    </button>
                    <label className="field">
                      <span>Reset account password</span>
                      <input
                        type="password"
                        value={supportResetPassword}
                        onChange={(event) => setSupportResetPassword(event.target.value)}
                        placeholder="minimum 10 chars"
                      />
                    </label>
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={handleResetSupportAccount}
                      disabled={supportBusy || supportResetPassword.length < 10}
                    >
                      Reset account password
                    </button>
                  </form>
                ) : null}
              </div>
            </section>
          ) : null}

          <section className="card">
            <div className="toolbar">
              <div>
                <h2>Tenant onboarding</h2>
                <p>Create a tenant and its primary subdomain. No demo tenant data exists.</p>
              </div>
              <button className="button button-secondary" type="button" onClick={handleLogout}>
                Sign out
              </button>
            </div>
            <form className="stack" onSubmit={handleCreateTenant}>
              <label className="field">
                <span>Tenant name</span>
                <input
                  type="text"
                  value={tenantName}
                  onChange={(event) => setTenantName(event.target.value)}
                  required
                />
              </label>
              <label className="field">
                <span>Primary subdomain</span>
                <input
                  type="text"
                  value={tenantSubdomain}
                  onChange={(event) => setTenantSubdomain(event.target.value.toLowerCase())}
                  required
                />
              </label>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={createInitialAdmin}
                  onChange={(event) => setCreateInitialAdmin(event.target.checked)}
                />
                <span>Create initial company admin</span>
              </label>
              {createInitialAdmin ? (
                <div className="card inset-card">
                  <h2>Initial company admin</h2>
                  <p>
                    This admin signs in at{' '}
                    <code>
                      http://{tenantSubdomain || 'your-subdomain'}.{appConfig.platformBaseDomain}:3000
                    </code>
                    .
                  </p>
                  <div className="stack">
                    <label className="field">
                      <span>Full name</span>
                      <input
                        type="text"
                        value={adminFullName}
                        onChange={(event) => setAdminFullName(event.target.value)}
                        required={createInitialAdmin}
                      />
                    </label>
                    <label className="field">
                      <span>Username</span>
                      <input
                        type="text"
                        value={adminUsername}
                        onChange={(event) => setAdminUsername(event.target.value.toLowerCase())}
                        required={createInitialAdmin}
                      />
                    </label>
                    <label className="field">
                      <span>Email (optional)</span>
                      <input
                        type="email"
                        value={adminEmail}
                        onChange={(event) => setAdminEmail(event.target.value)}
                      />
                    </label>
                    <label className="field">
                      <span>Password</span>
                      <input
                        type="password"
                        value={adminPassword}
                        onChange={(event) => setAdminPassword(event.target.value)}
                        required={createInitialAdmin}
                      />
                    </label>
                    <p className="status">
                      Password policy: minimum 10 characters with uppercase, lowercase, and a number.
                    </p>
                  </div>
                </div>
              ) : null}
              <button className="button" type="submit">
                Create tenant
              </button>
              {successMessage ? <p className="status">{successMessage}</p> : null}
              {tenantError ? <p className="status error">{tenantError}</p> : null}
            </form>
          </section>

          <section className="card">
            <h2>Tenants</h2>
            {loadingTenants ? <p className="status">Loading tenants...</p> : null}
            {!loadingTenants && tenants.length === 0 ? (
              <p className="status">No tenants exist yet.</p>
            ) : (
              <div className="table">
                <div className="table-row table-head">
                  <span>Name</span>
                  <span>Subdomain</span>
                  <span>Status</span>
                  <span>Created</span>
                </div>
                {tenants.map((tenant) => (
                  <div className="table-row" key={tenant.id}>
                    <span>{tenant.name}</span>
                    <span>{tenant.primary_subdomain}</span>
                    <span>{tenant.status}</span>
                    <span>{new Date(tenant.created_at).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card">
            <h2>Platform onboarding import</h2>
            <p>
              Upload one workbook with sheets: Sites, Drivers, Vehicles_Cards, and optional Driver_Compliance,
              Supervisor_Sites, Tanks, Equipment.
            </p>
            {preflightLoading ? <p className="status">Checking onboarding database readiness...</p> : null}
            {preflightError ? <p className="status error">{preflightError}</p> : null}
            {preflight && !preflight.db.ready ? (
              <p className="status error">
                DB not ready for onboarding. Run: <code>cd apps/api && pnpm prisma migrate deploy</code>
              </p>
            ) : null}
            <form className="stack" onSubmit={handleUploadAndPreview}>
              <label className="field">
                <span>Tenant</span>
                <select
                  value={selectedTenantId}
                  onChange={(event) => setSelectedTenantId(event.target.value)}
                  required
                >
                  <option value="">Select tenant</option>
                  {tenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.name} ({tenant.primary_subdomain})
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Workbook (.xlsx)</span>
                <input
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(event) => setWorkbookFile(event.target.files?.[0] ?? null)}
                  required
                />
              </label>
              <button
                className="button"
                type="submit"
                disabled={onboardingBusy || (preflight !== null && !preflight.db.ready)}
              >
                {onboardingBusy ? 'Processing...' : 'Upload and Preview'}
              </button>
            </form>

            {preview ? (
              <div className="stack">
                <div className="preview-summary">
                  <strong>Preview summary</strong>
                  <p>
                    Rows: {preview.summary.total_rows} | Errors: {preview.summary.errors_count} | Warnings:{' '}
                    {preview.summary.warnings_count}
                  </p>
                </div>
                <div className="sheet-tabs">
                  {previewSheets.map((sheetName) => (
                    <button
                      key={sheetName}
                      className={`button ${sheetName === activePreviewSheet ? '' : 'button-secondary'}`}
                      type="button"
                      onClick={() => setActivePreviewSheet(sheetName)}
                    >
                      {sheetName}
                    </button>
                  ))}
                </div>
                {activeSheet ? (
                  <div className="stack">
                    <p className="status">
                      {activePreviewSheet}: {activeSheet.rows.length} rows, {activeSheet.errors.length} errors,{' '}
                      {activeSheet.warnings.length} warnings
                    </p>
                    {activeSheet.errors.length > 0 ? (
                      <div className="table">
                        <div className="table-row table-head">
                          <span>Row</span>
                          <span>Field</span>
                          <span>Sheet</span>
                          <span>Message</span>
                        </div>
                        {activeSheet.errors.map((issue, index) => (
                          <div className="table-row" key={`${issue.sheet}:${issue.field ?? '-'}:${index}`}>
                            <span>{issue.row_number ?? '-'}</span>
                            <span>{issue.field ?? '-'}</span>
                            <span>{issue.sheet}</span>
                            <span>{issue.message}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="status">No validation errors in this sheet.</p>
                    )}
                    {activeSheet.warnings.length > 0 ? (
                      <div className="table">
                        <div className="table-row table-head">
                          <span>Row</span>
                          <span>Field</span>
                          <span>Sheet</span>
                          <span>Message</span>
                        </div>
                        {activeSheet.warnings.map((issue, index) => (
                          <div className="table-row" key={`warning:${issue.sheet}:${issue.field ?? '-'}:${index}`}>
                            <span>{issue.row_number ?? '-'}</span>
                            <span>{issue.field ?? '-'}</span>
                            <span>{issue.sheet}</span>
                            <span>{issue.message}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="status">No warnings in this sheet.</p>
                    )}
                  </div>
                ) : null}
                <button
                  className="button"
                  type="button"
                  disabled={onboardingBusy || preview.summary.errors_count > 0}
                  onClick={handleCommitOnboarding}
                >
                  Commit Import
                </button>
              </div>
            ) : null}

            {onboardingError ? <p className="status error">{onboardingError}</p> : null}
            {onboardingSuccess ? <p className="status">{onboardingSuccess}</p> : null}
          </section>

          <section className="card" data-testid="platform-operator-chat-v1">
            <h2>AI System Operator Chat (v1)</h2>
            <p>
              Internal troubleshooting assistant for operations. It analyzes system-memory docs and repo context to
              suggest likely root cause and safe next checks.
            </p>
            <form className="stack" onSubmit={handleAskOperator}>
              <label className="field">
                <span>Question</span>
                <textarea
                  value={operatorQuestion}
                  onChange={(event) => setOperatorQuestion(event.target.value)}
                  rows={3}
                  placeholder="Why is missing daily checks showing 0 for maqshan?"
                  required
                />
              </label>
              <button className="button" type="submit" disabled={operatorLoading}>
                {operatorLoading ? 'Analyzing…' : 'Ask operator assistant'}
              </button>
            </form>
            {operatorError ? <p className="status error">{operatorError}</p> : null}
            {operatorResponse ? (
              <div className="stack">
                <div className="preview-summary">
                  <strong>Likely cause</strong>
                  <p>{operatorResponse.likely_cause}</p>
                  <p>
                    Risk: <strong>{operatorResponse.risk_level}</strong> · Confidence:{' '}
                    <strong>{operatorResponse.confidence}</strong>
                    {operatorResponse.uncertain ? ' · Uncertain: yes (collect runtime evidence)' : ''}
                  </p>
                </div>
                <div>
                  <strong>Affected service(s)</strong>
                  <p>{operatorResponse.affected_services.join(', ')}</p>
                </div>
                <div>
                  <strong>Likely modules</strong>
                  <ul>
                    {operatorResponse.likely_modules.map((module) => (
                      <li key={module}>
                        <code>{module}</code>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <strong>Evidence</strong>
                  {operatorResponse.evidence.length === 0 ? (
                    <p className="status">No strong evidence found in current system-memory docs.</p>
                  ) : (
                    <ul>
                      {operatorResponse.evidence.map((entry) => (
                        <li key={`${entry.path}:${entry.excerpt}`}>
                          {entry.excerpt} <code>({entry.path})</code>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <strong>Next checks</strong>
                  <ul>
                    {operatorResponse.next_checks.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}
          </section>
        </>
      )}
    </>
  );
}
