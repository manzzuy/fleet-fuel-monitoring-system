import type {
  ChecklistMasterResponse,
  ComplianceRecordsListResponse,
  CreateNotificationContactRequest,
  ComplianceTypesListResponse,
  CreateComplianceRecordRequest,
  CreateComplianceTypeRequest,
  CreateTenantRequest,
  CreateDailyCheckRequest,
  CreateFuelEntryRequest,
  DailyCheckDetailsResponse,
  DailyChecksListResponse,
  DashboardAlertsResponse,
  ErrorResponse,
  FuelEntriesListResponse,
  OnboardingBatch,
  OnboardingCommitResponse,
  OnboardingCreateBatchRequest,
  OnboardingPreflightResponse,
  OnboardingPreviewResponse,
  PlatformLoginRequest,
  PlatformLoginResponse,
  PlatformTenantRecord,
  DriverLookupRecord,
  SiteLookupRecord,
  TankLookupRecord,
  NotificationContactsListResponse,
  NotificationRecipientsPreviewResponse,
  NotificationPreviewEventType,
  TenantSettingsResponse,
  ScopeStatus,
  TenantDashboardSummaryResponse,
  TenantLoginRequest,
  TenantLoginResponse,
  TenantedHealthResponse,
  TenantedSystemStatusResponse,
  UpdateTenantNotificationSettingsRequest,
  UpdateNotificationContactRequest,
  UpdateComplianceTypeRequest,
  VehicleLookupRecord,
} from '@fleet-fuel/shared';

import { appConfig } from './config';

export class ApiClientError extends Error {
  code: string | undefined;
  hint: string | undefined;
  details: unknown;
  requestId: string | undefined;

  constructor(message: string, payload?: ErrorResponse) {
    super(message);
    this.code = payload?.error.code;
    this.hint = payload?.error.hint;
    this.details = payload?.error.details;
    this.requestId = payload?.request_id;
  }
}

export interface MasterDriverWritePayload {
  full_name?: string;
  employee_no?: string | null;
  username?: string;
  site_id?: string | null;
  assigned_vehicle_id?: string | null;
  is_active?: boolean;
}

export interface MasterVehicleWritePayload {
  fleet_no?: string;
  plate_no?: string | null;
  site_id?: string | null;
  assigned_driver_user_id?: string | null;
  is_active?: boolean;
}

export interface MasterSiteWritePayload {
  site_code?: string;
  site_name?: string;
  location?: string | null;
  is_active?: boolean;
}

export interface MasterTankWritePayload {
  tank_name?: string;
  capacity_l?: string;
  reorder_level_l?: string;
  site_id?: string;
}

async function parseJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as (ErrorResponse & Record<string, unknown>) | null;

  if (!response.ok) {
    throw new ApiClientError(payload?.error?.message ?? `Request failed with status ${response.status}.`, payload ?? undefined);
  }

  return payload as T;
}

export async function platformLogin(payload: PlatformLoginRequest): Promise<PlatformLoginResponse> {
  const response = await fetch(`${appConfig.apiBaseUrl}/auth/platform-login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return parseJson<PlatformLoginResponse>(response);
}

export async function tenantLogin(
  tenantHost: string,
  payload: TenantLoginRequest,
): Promise<TenantLoginResponse> {
  const response = await fetch(`${appConfig.apiBaseUrl}/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-host': tenantHost,
    },
    body: JSON.stringify(payload),
  });

  return parseJson<TenantLoginResponse>(response);
}

export async function listTenants(accessToken: string): Promise<{ items: PlatformTenantRecord[] }> {
  const response = await fetch(`${appConfig.apiBaseUrl}/platform/tenants`, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });

  return parseJson<{ items: PlatformTenantRecord[] }>(response);
}

export async function createTenant(
  accessToken: string,
  payload: CreateTenantRequest,
): Promise<PlatformTenantRecord> {
  const response = await fetch(`${appConfig.apiBaseUrl}/platform/tenants`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return parseJson<PlatformTenantRecord>(response);
}

export async function fetchTenantedHealth(
  tenantHost: string,
  accessToken?: string,
): Promise<TenantedHealthResponse> {
  const response = await fetch(`${appConfig.apiBaseUrl}/tenanted/health`, {
    headers: {
      'x-forwarded-host': tenantHost,
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    cache: 'no-store',
  });

  return parseJson<TenantedHealthResponse>(response);
}

export async function fetchTenantedSystemStatus(
  tenantHost: string,
  accessToken: string,
): Promise<TenantedSystemStatusResponse> {
  const response = await fetch(`${appConfig.apiBaseUrl}/tenanted/system/status`, {
    headers: {
      'x-forwarded-host': tenantHost,
      authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  });

  return parseJson<TenantedSystemStatusResponse>(response);
}

export async function getTenantDashboardSummary(
  tenantHost: string,
  accessToken: string,
): Promise<TenantDashboardSummaryResponse> {
  const response = await fetch(`${appConfig.apiBaseUrl}/tenanted/dashboard/summary`, {
    headers: {
      'x-forwarded-host': tenantHost,
      authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  });

  return parseJson<TenantDashboardSummaryResponse>(response);
}

export async function getTenantDashboardAlerts(
  tenantHost: string,
  accessToken: string,
  query: Record<string, string | undefined> = {},
): Promise<DashboardAlertsResponse> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) {
      params.set(key, value);
    }
  }

  const response = await fetch(
    `${appConfig.apiBaseUrl}/tenanted/dashboard/alerts${params.toString() ? `?${params.toString()}` : ''}`,
    {
      headers: {
        'x-forwarded-host': tenantHost,
        authorization: `Bearer ${accessToken}`,
      },
      cache: 'no-store',
    },
  );

  return parseJson<DashboardAlertsResponse>(response);
}

export async function createOnboardingBatch(
  accessToken: string,
  payload: OnboardingCreateBatchRequest,
): Promise<OnboardingBatch> {
  const response = await fetch(`${appConfig.apiBaseUrl}/platform/onboarding/batches`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return parseJson<OnboardingBatch>(response);
}

export async function onboardingPreflight(accessToken: string): Promise<OnboardingPreflightResponse> {
  const response = await fetch(`${appConfig.apiBaseUrl}/platform/onboarding/preflight`, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  });

  return parseJson<OnboardingPreflightResponse>(response);
}

export async function uploadOnboardingWorkbook(
  accessToken: string,
  batchId: string,
  file: File,
): Promise<OnboardingBatch> {
  const form = new FormData();
  form.append('file', file);

  const response = await fetch(`${appConfig.apiBaseUrl}/platform/onboarding/batches/${batchId}/upload`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
    body: form,
  });

  return parseJson<OnboardingBatch>(response);
}

export async function fetchOnboardingPreview(
  accessToken: string,
  batchId: string,
): Promise<OnboardingPreviewResponse> {
  const response = await fetch(`${appConfig.apiBaseUrl}/platform/onboarding/batches/${batchId}/preview`, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  });

  return parseJson<OnboardingPreviewResponse>(response);
}

export async function commitOnboardingBatch(
  accessToken: string,
  batchId: string,
): Promise<OnboardingCommitResponse> {
  const response = await fetch(`${appConfig.apiBaseUrl}/platform/onboarding/batches/${batchId}/commit`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });

  return parseJson<OnboardingCommitResponse>(response);
}

export async function createFuelEntry(
  tenantHost: string,
  accessToken: string,
  payload: CreateFuelEntryRequest,
): Promise<{ entry: FuelEntriesListResponse['items'][number]; warnings: string[]; request_id: string }> {
  const response = await fetch(`${appConfig.apiBaseUrl}/tenanted/fuel-entries`, {
    method: 'POST',
    headers: {
      'x-forwarded-host': tenantHost,
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return parseJson<{ entry: FuelEntriesListResponse['items'][number]; warnings: string[]; request_id: string }>(
    response,
  );
}

export async function listFuelEntries(
  tenantHost: string,
  accessToken: string,
  query: Record<string, string | undefined> = {},
): Promise<FuelEntriesListResponse> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) {
      params.set(key, value);
    }
  }

  const response = await fetch(
    `${appConfig.apiBaseUrl}/tenanted/fuel-entries${params.toString() ? `?${params.toString()}` : ''}`,
    {
      headers: {
        'x-forwarded-host': tenantHost,
        authorization: `Bearer ${accessToken}`,
      },
      cache: 'no-store',
    },
  );

  return parseJson<FuelEntriesListResponse>(response);
}

export async function listFuelLogs(
  tenantHost: string,
  accessToken: string,
  query: Record<string, string | undefined> = {},
): Promise<FuelEntriesListResponse> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) {
      params.set(key, value);
    }
  }

  const response = await fetch(
    `${appConfig.apiBaseUrl}/tenanted/fuel-logs${params.toString() ? `?${params.toString()}` : ''}`,
    {
      headers: {
        'x-forwarded-host': tenantHost,
        authorization: `Bearer ${accessToken}`,
      },
      cache: 'no-store',
    },
  );

  return parseJson<FuelEntriesListResponse>(response);
}

export async function getChecklistMaster(
  tenantHost: string,
  accessToken: string,
): Promise<ChecklistMasterResponse> {
  const response = await fetch(`${appConfig.apiBaseUrl}/tenanted/checklists/master`, {
    headers: {
      'x-forwarded-host': tenantHost,
      authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  });

  return parseJson<ChecklistMasterResponse>(response);
}

export async function createDailyCheck(
  tenantHost: string,
  accessToken: string,
  payload: CreateDailyCheckRequest,
): Promise<{ id: string; status: 'DRAFT' | 'SUBMITTED'; request_id: string }> {
  const response = await fetch(`${appConfig.apiBaseUrl}/tenanted/daily-checks`, {
    method: 'POST',
    headers: {
      'x-forwarded-host': tenantHost,
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return parseJson<{ id: string; status: 'DRAFT' | 'SUBMITTED'; request_id: string }>(response);
}

export async function listDailyChecks(
  tenantHost: string,
  accessToken: string,
  query: Record<string, string | undefined> = {},
): Promise<DailyChecksListResponse> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) {
      params.set(key, value);
    }
  }

  const response = await fetch(
    `${appConfig.apiBaseUrl}/tenanted/daily-checks${params.toString() ? `?${params.toString()}` : ''}`,
    {
      headers: {
        'x-forwarded-host': tenantHost,
        authorization: `Bearer ${accessToken}`,
      },
      cache: 'no-store',
    },
  );

  return parseJson<DailyChecksListResponse>(response);
}

export async function getDailyCheck(
  tenantHost: string,
  accessToken: string,
  id: string,
): Promise<DailyCheckDetailsResponse> {
  const response = await fetch(`${appConfig.apiBaseUrl}/tenanted/daily-checks/${id}`, {
    headers: {
      'x-forwarded-host': tenantHost,
      authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  });

  return parseJson<DailyCheckDetailsResponse>(response);
}

export async function submitDailyCheck(
  tenantHost: string,
  accessToken: string,
  id: string,
  payload: { items: Array<{ item_code: string; status: 'OK' | 'NOT_OK' | 'NA'; notes?: string; photo_url?: string }> },
): Promise<{ id: string; status: 'DRAFT' | 'SUBMITTED'; request_id: string }> {
  const response = await fetch(`${appConfig.apiBaseUrl}/tenanted/daily-checks/${id}/submit`, {
    method: 'PUT',
    headers: {
      'x-forwarded-host': tenantHost,
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return parseJson<{ id: string; status: 'DRAFT' | 'SUBMITTED'; request_id: string }>(response);
}

export async function listTenantVehicles(
  tenantHost: string,
  accessToken: string,
  query: Record<string, string | undefined> = {},
): Promise<{ items: VehicleLookupRecord[]; scope_status?: ScopeStatus; request_id: string }> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) {
      params.set(key, value);
    }
  }

  const response = await fetch(
    `${appConfig.apiBaseUrl}/tenanted/vehicles${params.toString() ? `?${params.toString()}` : ''}`,
    {
      headers: {
        'x-forwarded-host': tenantHost,
        authorization: `Bearer ${accessToken}`,
      },
      cache: 'no-store',
    },
  );

  return parseJson<{ items: VehicleLookupRecord[]; scope_status?: ScopeStatus; request_id: string }>(response);
}

export async function listTenantDrivers(
  tenantHost: string,
  accessToken: string,
  query: Record<string, string | undefined> = {},
): Promise<{ items: DriverLookupRecord[]; scope_status?: ScopeStatus; request_id: string }> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) {
      params.set(key, value);
    }
  }

  const response = await fetch(
    `${appConfig.apiBaseUrl}/tenanted/drivers${params.toString() ? `?${params.toString()}` : ''}`,
    {
      headers: {
        'x-forwarded-host': tenantHost,
        authorization: `Bearer ${accessToken}`,
      },
      cache: 'no-store',
    },
  );

  return parseJson<{ items: DriverLookupRecord[]; scope_status?: ScopeStatus; request_id: string }>(response);
}

export async function listMasterDrivers(
  tenantHost: string,
  accessToken: string,
  query: Record<string, string | undefined> = {},
): Promise<{ items: DriverLookupRecord[]; scope_status?: ScopeStatus; request_id: string }> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) {
      params.set(key, value);
    }
  }
  const response = await fetch(
    `${appConfig.apiBaseUrl}/tenanted/master-data/drivers${params.toString() ? `?${params.toString()}` : ''}`,
    {
      headers: {
        'x-forwarded-host': tenantHost,
        authorization: `Bearer ${accessToken}`,
      },
      cache: 'no-store',
    },
  );
  return parseJson<{ items: DriverLookupRecord[]; scope_status?: ScopeStatus; request_id: string }>(response);
}

export async function createMasterDriver(
  tenantHost: string,
  accessToken: string,
  payload: Required<Pick<MasterDriverWritePayload, 'full_name' | 'username'>> & MasterDriverWritePayload,
) {
  const response = await fetch(`${appConfig.apiBaseUrl}/tenanted/master-data/drivers`, {
    method: 'POST',
    headers: {
      'x-forwarded-host': tenantHost,
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  return parseJson<{ id: string; request_id: string }>(response);
}

export async function updateMasterDriver(
  tenantHost: string,
  accessToken: string,
  driverId: string,
  payload: MasterDriverWritePayload,
) {
  const response = await fetch(`${appConfig.apiBaseUrl}/tenanted/master-data/drivers/${driverId}`, {
    method: 'PUT',
    headers: {
      'x-forwarded-host': tenantHost,
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  return parseJson<{ ok: true; request_id: string }>(response);
}

export async function listComplianceTypes(
  tenantHost: string,
  accessToken: string,
  query: Record<string, string | undefined> = {},
): Promise<ComplianceTypesListResponse> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) {
      params.set(key, value);
    }
  }

  const response = await fetch(
    `${appConfig.apiBaseUrl}/tenanted/compliance/types${params.toString() ? `?${params.toString()}` : ''}`,
    {
      headers: {
        'x-forwarded-host': tenantHost,
        authorization: `Bearer ${accessToken}`,
      },
      cache: 'no-store',
    },
  );

  return parseJson<ComplianceTypesListResponse>(response);
}

export async function createComplianceType(
  tenantHost: string,
  accessToken: string,
  payload: CreateComplianceTypeRequest,
): Promise<{ item: ComplianceTypesListResponse['items'][number]; request_id: string }> {
  const response = await fetch(`${appConfig.apiBaseUrl}/tenanted/compliance/types`, {
    method: 'POST',
    headers: {
      'x-forwarded-host': tenantHost,
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return parseJson<{ item: ComplianceTypesListResponse['items'][number]; request_id: string }>(response);
}

export async function updateComplianceType(
  tenantHost: string,
  accessToken: string,
  typeId: string,
  payload: UpdateComplianceTypeRequest,
): Promise<{ item: ComplianceTypesListResponse['items'][number]; request_id: string }> {
  const response = await fetch(`${appConfig.apiBaseUrl}/tenanted/compliance/types/${typeId}`, {
    method: 'PUT',
    headers: {
      'x-forwarded-host': tenantHost,
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return parseJson<{ item: ComplianceTypesListResponse['items'][number]; request_id: string }>(response);
}

export async function listComplianceRecords(
  tenantHost: string,
  accessToken: string,
  query: Record<string, string | undefined> = {},
): Promise<ComplianceRecordsListResponse> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) {
      params.set(key, value);
    }
  }

  const response = await fetch(
    `${appConfig.apiBaseUrl}/tenanted/compliance/records${params.toString() ? `?${params.toString()}` : ''}`,
    {
      headers: {
        'x-forwarded-host': tenantHost,
        authorization: `Bearer ${accessToken}`,
      },
      cache: 'no-store',
    },
  );

  return parseJson<ComplianceRecordsListResponse>(response);
}

export async function createComplianceRecord(
  tenantHost: string,
  accessToken: string,
  payload: CreateComplianceRecordRequest,
): Promise<{ item: ComplianceRecordsListResponse['items'][number]; request_id: string }> {
  const response = await fetch(`${appConfig.apiBaseUrl}/tenanted/compliance/records`, {
    method: 'POST',
    headers: {
      'x-forwarded-host': tenantHost,
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return parseJson<{ item: ComplianceRecordsListResponse['items'][number]; request_id: string }>(response);
}

export async function listTenantSites(
  tenantHost: string,
  accessToken: string,
  query: Record<string, string | undefined> = {},
): Promise<{ items: SiteLookupRecord[]; scope_status?: ScopeStatus; request_id: string }> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) {
      params.set(key, value);
    }
  }

  const response = await fetch(
    `${appConfig.apiBaseUrl}/tenanted/sites${params.toString() ? `?${params.toString()}` : ''}`,
    {
      headers: {
        'x-forwarded-host': tenantHost,
        authorization: `Bearer ${accessToken}`,
      },
      cache: 'no-store',
    },
  );

  return parseJson<{ items: SiteLookupRecord[]; scope_status?: ScopeStatus; request_id: string }>(response);
}

export async function createMasterSite(
  tenantHost: string,
  accessToken: string,
  payload: Required<Pick<MasterSiteWritePayload, 'site_code' | 'site_name'>> & MasterSiteWritePayload,
) {
  const response = await fetch(`${appConfig.apiBaseUrl}/tenanted/master-data/sites`, {
    method: 'POST',
    headers: {
      'x-forwarded-host': tenantHost,
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  return parseJson<{ id: string; request_id: string }>(response);
}

export async function updateMasterSite(
  tenantHost: string,
  accessToken: string,
  siteId: string,
  payload: MasterSiteWritePayload,
) {
  const response = await fetch(`${appConfig.apiBaseUrl}/tenanted/master-data/sites/${siteId}`, {
    method: 'PUT',
    headers: {
      'x-forwarded-host': tenantHost,
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  return parseJson<{ ok: true; request_id: string }>(response);
}

export async function listTenantTanks(
  tenantHost: string,
  accessToken: string,
  query: Record<string, string | undefined> = {},
): Promise<{ items: TankLookupRecord[]; scope_status?: ScopeStatus; request_id: string }> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) {
      params.set(key, value);
    }
  }

  const response = await fetch(
    `${appConfig.apiBaseUrl}/tenanted/tanks${params.toString() ? `?${params.toString()}` : ''}`,
    {
      headers: {
        'x-forwarded-host': tenantHost,
        authorization: `Bearer ${accessToken}`,
      },
      cache: 'no-store',
    },
  );

  return parseJson<{ items: TankLookupRecord[]; scope_status?: ScopeStatus; request_id: string }>(response);
}

export async function createMasterTank(
  tenantHost: string,
  accessToken: string,
  payload: Required<Pick<MasterTankWritePayload, 'tank_name' | 'capacity_l' | 'reorder_level_l' | 'site_id'>>,
) {
  const response = await fetch(`${appConfig.apiBaseUrl}/tenanted/master-data/tanks`, {
    method: 'POST',
    headers: {
      'x-forwarded-host': tenantHost,
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  return parseJson<{ id: string; request_id: string }>(response);
}

export async function updateMasterTank(
  tenantHost: string,
  accessToken: string,
  tankId: string,
  payload: MasterTankWritePayload,
) {
  const response = await fetch(`${appConfig.apiBaseUrl}/tenanted/master-data/tanks/${tankId}`, {
    method: 'PUT',
    headers: {
      'x-forwarded-host': tenantHost,
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  return parseJson<{ ok: true; request_id: string }>(response);
}

export async function listMasterVehicles(
  tenantHost: string,
  accessToken: string,
  query: Record<string, string | undefined> = {},
): Promise<{ items: VehicleLookupRecord[]; scope_status?: ScopeStatus; request_id: string }> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) {
      params.set(key, value);
    }
  }
  const response = await fetch(
    `${appConfig.apiBaseUrl}/tenanted/master-data/vehicles${params.toString() ? `?${params.toString()}` : ''}`,
    {
      headers: {
        'x-forwarded-host': tenantHost,
        authorization: `Bearer ${accessToken}`,
      },
      cache: 'no-store',
    },
  );
  return parseJson<{ items: VehicleLookupRecord[]; scope_status?: ScopeStatus; request_id: string }>(response);
}

export async function createMasterVehicle(
  tenantHost: string,
  accessToken: string,
  payload: Required<Pick<MasterVehicleWritePayload, 'fleet_no'>> & MasterVehicleWritePayload,
) {
  const response = await fetch(`${appConfig.apiBaseUrl}/tenanted/master-data/vehicles`, {
    method: 'POST',
    headers: {
      'x-forwarded-host': tenantHost,
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  return parseJson<{ id: string; request_id: string }>(response);
}

export async function updateMasterVehicle(
  tenantHost: string,
  accessToken: string,
  vehicleId: string,
  payload: MasterVehicleWritePayload,
) {
  const response = await fetch(`${appConfig.apiBaseUrl}/tenanted/master-data/vehicles/${vehicleId}`, {
    method: 'PUT',
    headers: {
      'x-forwarded-host': tenantHost,
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  return parseJson<{ ok: true; request_id: string }>(response);
}

export async function getTenantSettings(
  tenantHost: string,
  accessToken: string,
): Promise<TenantSettingsResponse> {
  const response = await fetch(`${appConfig.apiBaseUrl}/tenanted/tenant/settings`, {
    headers: {
      'x-forwarded-host': tenantHost,
      authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  });

  return parseJson<TenantSettingsResponse>(response);
}

export async function updateTenantNotificationSettings(
  tenantHost: string,
  accessToken: string,
  payload: UpdateTenantNotificationSettingsRequest,
): Promise<TenantSettingsResponse> {
  const response = await fetch(`${appConfig.apiBaseUrl}/tenanted/tenant/settings/notifications`, {
    method: 'PUT',
    headers: {
      'x-forwarded-host': tenantHost,
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return parseJson<TenantSettingsResponse>(response);
}

export async function listNotificationContacts(
  tenantHost: string,
  accessToken: string,
): Promise<NotificationContactsListResponse> {
  const response = await fetch(`${appConfig.apiBaseUrl}/tenanted/notification-contacts`, {
    headers: {
      'x-forwarded-host': tenantHost,
      authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  });

  return parseJson<NotificationContactsListResponse>(response);
}

export async function createNotificationContact(
  tenantHost: string,
  accessToken: string,
  payload: CreateNotificationContactRequest,
): Promise<{ item: NotificationContactsListResponse['items'][number]; request_id: string }> {
  const response = await fetch(`${appConfig.apiBaseUrl}/tenanted/notification-contacts`, {
    method: 'POST',
    headers: {
      'x-forwarded-host': tenantHost,
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return parseJson<{ item: NotificationContactsListResponse['items'][number]; request_id: string }>(response);
}

export async function updateNotificationContact(
  tenantHost: string,
  accessToken: string,
  contactId: string,
  payload: UpdateNotificationContactRequest,
): Promise<{ item: NotificationContactsListResponse['items'][number]; request_id: string }> {
  const response = await fetch(`${appConfig.apiBaseUrl}/tenanted/notification-contacts/${contactId}`, {
    method: 'PUT',
    headers: {
      'x-forwarded-host': tenantHost,
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return parseJson<{ item: NotificationContactsListResponse['items'][number]; request_id: string }>(response);
}

export async function assignNotificationContactToSite(
  tenantHost: string,
  accessToken: string,
  contactId: string,
  siteId: string,
): Promise<{ item: NotificationContactsListResponse['items'][number] | null; request_id: string }> {
  const response = await fetch(`${appConfig.apiBaseUrl}/tenanted/notification-contacts/${contactId}/sites`, {
    method: 'POST',
    headers: {
      'x-forwarded-host': tenantHost,
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ site_id: siteId }),
  });

  return parseJson<{ item: NotificationContactsListResponse['items'][number] | null; request_id: string }>(response);
}

export async function removeNotificationContactSiteAssignment(
  tenantHost: string,
  accessToken: string,
  contactId: string,
  siteId: string,
): Promise<{ item: NotificationContactsListResponse['items'][number] | null; request_id: string }> {
  const response = await fetch(
    `${appConfig.apiBaseUrl}/tenanted/notification-contacts/${contactId}/sites/${siteId}`,
    {
      method: 'DELETE',
      headers: {
        'x-forwarded-host': tenantHost,
        authorization: `Bearer ${accessToken}`,
      },
    },
  );

  return parseJson<{ item: NotificationContactsListResponse['items'][number] | null; request_id: string }>(response);
}

export async function previewNotificationRecipients(
  tenantHost: string,
  accessToken: string,
  query: {
    event_type: NotificationPreviewEventType;
    site_id?: string;
  },
): Promise<NotificationRecipientsPreviewResponse> {
  const params = new URLSearchParams();
  params.set('event_type', query.event_type);
  if (query.site_id) {
    params.set('site_id', query.site_id);
  }

  const response = await fetch(
    `${appConfig.apiBaseUrl}/tenanted/tenant/settings/notifications/preview?${params.toString()}`,
    {
      headers: {
        'x-forwarded-host': tenantHost,
        authorization: `Bearer ${accessToken}`,
      },
      cache: 'no-store',
    },
  );

  return parseJson<NotificationRecipientsPreviewResponse>(response);
}
