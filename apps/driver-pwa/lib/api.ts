import type {
  ChecklistMasterResponse,
  CreateDriverDailyCheckRequest,
  CreateDriverFuelEntryRequest,
  FuelEntryRecord,
  DriverDashboardResponse,
  ErrorResponse,
  TenantLoginRequest,
  TenantLoginResponse,
  TenantedHealthResponse,
  VehicleLookupRecord,
} from '@fleet-fuel/shared';

import { appConfig } from './config';
import { resolveTenantHost } from './tenant';

export class ApiClientError extends Error {
  code: string | undefined;
  requestId: string | undefined;
  details: unknown;

  constructor(message: string, payload?: ErrorResponse) {
    super(message);
    this.code = payload?.error.code;
    this.requestId = payload?.request_id;
    this.details = payload?.error.details;
  }
}

async function parseJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as (ErrorResponse & Record<string, unknown>) | null;

  if (!response.ok) {
    throw new ApiClientError(payload?.error?.message ?? `Request failed with status ${response.status}.`, payload ?? undefined);
  }

  return payload as T;
}

function tenantHeaders(host: string, token?: string): HeadersInit {
  return {
    'x-forwarded-host': host,
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

export async function tenantLogin(tenantHost: string, payload: TenantLoginRequest): Promise<TenantLoginResponse> {
  const response = await fetch(`${appConfig.apiBaseUrl}/auth/login`, {
    method: 'POST',
    headers: {
      ...tenantHeaders(tenantHost),
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return parseJson<TenantLoginResponse>(response);
}

export async function fetchTenantedHealth(host: string | null | undefined, token?: string) {
  const tenantHost = resolveTenantHost(host);

  if (!tenantHost) {
    throw new Error('Tenant host could not be resolved from the current request host.');
  }

  const response = await fetch(`${appConfig.apiBaseUrl}/tenanted/health`, {
    headers: tenantHeaders(tenantHost, token),
    cache: 'no-store',
  });

  return parseJson<TenantedHealthResponse>(response);
}

export async function getDriverDashboard(tenantHost: string, token: string) {
  const response = await fetch(`${appConfig.apiBaseUrl}/tenanted/driver/dashboard`, {
    headers: tenantHeaders(tenantHost, token),
    cache: 'no-store',
  });

  return parseJson<DriverDashboardResponse>(response);
}

export async function getDriverVehicles(tenantHost: string, token: string) {
  const response = await fetch(`${appConfig.apiBaseUrl}/tenanted/driver/vehicles`, {
    headers: tenantHeaders(tenantHost, token),
    cache: 'no-store',
  });

  return parseJson<{ items: VehicleLookupRecord[]; request_id: string }>(response);
}

export async function getDriverChecklistMaster(tenantHost: string, token: string) {
  const response = await fetch(`${appConfig.apiBaseUrl}/tenanted/driver/checklists/master`, {
    headers: tenantHeaders(tenantHost, token),
    cache: 'no-store',
  });

  return parseJson<ChecklistMasterResponse>(response);
}

export async function createDriverDailyCheck(tenantHost: string, token: string, payload: CreateDriverDailyCheckRequest) {
  const response = await fetch(`${appConfig.apiBaseUrl}/tenanted/driver/daily-checks`, {
    method: 'POST',
    headers: {
      ...tenantHeaders(tenantHost, token),
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return parseJson<{ id: string; status: 'DRAFT' | 'SUBMITTED'; request_id: string }>(response);
}

export async function submitDriverDailyCheck(
  tenantHost: string,
  token: string,
  checkId: string,
  payload: { items: Array<{ item_code: string; status: 'OK' | 'NOT_OK' | 'NA'; notes?: string; photo_url?: string }> },
) {
  const response = await fetch(`${appConfig.apiBaseUrl}/tenanted/driver/daily-checks/${checkId}/submit`, {
    method: 'PUT',
    headers: {
      ...tenantHeaders(tenantHost, token),
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return parseJson<{ id: string; status: 'DRAFT' | 'SUBMITTED'; request_id: string }>(response);
}

export async function createDriverFuelEntry(
  tenantHost: string,
  token: string,
  payload: CreateDriverFuelEntryRequest,
) {
  const response = await fetch(`${appConfig.apiBaseUrl}/tenanted/driver/fuel-entries`, {
    method: 'POST',
    headers: {
      ...tenantHeaders(tenantHost, token),
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return parseJson<{ entry: FuelEntryRecord; warnings: string[]; request_id: string }>(response);
}

export async function uploadDriverReceipt(tenantHost: string, token: string, file: File) {
  const form = new FormData();
  form.append('receipt', file);

  const response = await fetch(`${appConfig.apiBaseUrl}/tenanted/driver/receipts/upload`, {
    method: 'POST',
    headers: tenantHeaders(tenantHost, token),
    body: form,
  });

  return parseJson<{ receipt_url: string; request_id: string }>(response);
}
