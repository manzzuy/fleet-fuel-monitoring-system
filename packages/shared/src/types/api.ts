export interface StandardError {
  code: string;
  message: string;
  details?: unknown;
  hint?: string;
}

export interface ErrorResponse {
  error: {
    code: StandardError['code'];
    message: StandardError['message'];
    details?: StandardError['details'];
    hint?: StandardError['hint'];
  };
  request_id?: string;
}

export interface TenantedHealthResponse {
  status: 'ok';
  tenant_id: string;
  subdomain: string;
  request_id: string;
}

export interface TenantedSystemStatusResponse {
  status: 'ok' | 'degraded';
  environment: {
    name: 'development' | 'test' | 'production';
    app_version: string;
    build_sha: string | null;
  };
  services: {
    api: {
      reachable: true;
    };
    database: {
      reachable: boolean;
      error?: string;
    };
    notifications: {
      mode: 'stub' | 'meta_cloud_api' | 'twilio_whatsapp';
      readiness:
        | 'stub_mode'
        | 'provider_not_configured'
        | 'provider_ready_not_enabled'
        | 'ready_for_controlled_send';
      delivery_enabled: boolean;
    };
  };
  readiness: {
    config_ready: boolean;
    migration_ready: boolean;
    missing_tables: string[];
  };
  request_id: string;
}

export type TenantStatus = 'ACTIVE' | 'SUSPENDED';

export interface TenantAdminSummary {
  id: string;
  email?: string | null;
  username: string;
  full_name: string;
  role: 'COMPANY_ADMIN';
}

export interface PlatformLoginResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: string;
  tenant_id: null;
  role: 'PLATFORM_OWNER';
  actor_type: 'PLATFORM';
}

export interface PlatformTenantRecord {
  id: string;
  name: string;
  status: TenantStatus;
  primary_subdomain: string;
  created_at: string;
  initial_admin?: TenantAdminSummary;
}

export interface TenantLoginResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: string;
  tenant_id: string;
  role: 'COMPANY_ADMIN' | 'SUPERVISOR' | 'SITE_SUPERVISOR' | 'TRANSPORT_MANAGER' | 'HEAD_OFFICE_ADMIN' | 'DRIVER';
  actor_type: 'STAFF' | 'DRIVER';
}

export type ScopeStatus = 'full_tenant_scope' | 'site_scope_limited' | 'no_site_scope_assigned';

export interface DashboardKpis {
  vehicles_total: number;
  drivers_total: number;
  fuel_cards_total: number;
  sites_total: number;
  tanks_total: number;
}

export interface DashboardOnboardingCounts {
  sites: number;
  drivers: number;
  vehicles: number;
  fuel_cards: number;
  tanks: number;
  equipment: number;
}

export interface DashboardLastBatch {
  id: string;
  status: 'UPLOADED' | 'PREVIEWED' | 'COMMITTED' | 'FAILED';
  created_at: string;
  committed_at: string | null;
  counts: DashboardOnboardingCounts;
}

export interface DashboardRecentVehicle {
  id: string;
  fleet_number: string;
  plate_number: string | null;
  vehicle_type: string | null;
  site_code: string | null;
  created_at: string;
}

export interface DashboardRecentDriver {
  id: string;
  employee_no: string | null;
  username: string | null;
  full_name: string;
  role: 'DRIVER' | 'SITE_SUPERVISOR';
  created_at: string;
}

export interface DashboardRecentFuelEntry {
  id: string;
  entry_date: string;
  entry_time: string | null;
  liters: string;
  odometer_km: number | null;
  source_type: 'CARD' | 'TANK' | 'STATION' | 'MANUAL' | 'APPROVED_SOURCE';
  approved_source_context?: string | null;
  odometer_fallback_used?: boolean;
  odometer_fallback_reason?: string | null;
  vehicle: {
    id: string;
    fleet_no: string;
    plate_no: string | null;
  };
  driver: {
    id: string;
    full_name: string;
  } | null;
  created_at: string;
}

export interface DashboardDailyChecksToday {
  submitted_count: number;
  pending_count: number;
}

export type DashboardAlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH';
export type DashboardAlertType =
  | 'missing_daily_check'
  | 'checklist_issue_reported'
  | 'critical_checklist_issue'
  | 'repeated_checklist_issues_vehicle'
  | 'driver_frequent_skips'
  | 'compliance_expiring_soon'
  | 'compliance_expired'
  | 'fuel_missing_receipt'
  | 'fuel_used_odometer_fallback'
  | 'fuel_used_approved_source'
  | 'suspicious_high_liters'
  | 'suspicious_high_liters_vs_distance'
  | 'suspicious_repeat_fuel'
  | 'fueling_too_soon_after_previous_fill'
  | 'suspicious_consumption_deviation'
  | 'suspicious_high_risk_combination';

export interface DashboardAlertRecord {
  id: string;
  alert_type: DashboardAlertType;
  severity: DashboardAlertSeverity;
  occurred_at: string;
  vehicle: {
    id: string;
    fleet_no: string;
    plate_no: string | null;
  } | null;
  driver: {
    id: string;
    full_name: string;
  } | null;
  site: {
    id: string;
    site_code: string;
    site_name: string;
  } | null;
  reason: string;
  related_record_id: string | null;
  anomaly_details?: {
    previous_odometer_km?: number | null;
    current_odometer_km?: number | null;
    distance_km?: number | null;
    expected_km_per_l?: number | null;
    expected_liters?: number | null;
    actual_liters?: number | null;
    deviation_pct?: number | null;
    risk_score?: number | null;
  };
  action: {
    label: string;
    target: string;
  };
}

export interface DashboardAlertsSummary {
  date: string;
  vehicles_missing_daily_check: number;
  checklist_issues_today: number;
  fuel_entries_today: number;
  high_priority_exceptions: number;
  total_alerts: number;
}

export interface DashboardAlertsResponse {
  tenant: {
    id: string;
    subdomain: string;
  };
  summary: DashboardAlertsSummary;
  items: DashboardAlertRecord[];
  scope_status?: ScopeStatus;
  request_id: string;
}

export interface DashboardMonitoringSummary {
  vehicles_missing_daily_check: number;
  high_risk_fuel_alerts: number;
  compliance_expired: number;
  compliance_expiring_soon: number;
  receipt_gaps: number;
  checklist_issues_today: number;
  fuel_entries_today: number;
  fuel_missing_receipt: number;
  fuel_odometer_fallback: number;
  approved_source_usage: number;
  high_priority_exceptions: number;
  total_alerts: number;
}

export interface TenantDashboardSummaryResponse {
  tenant: {
    id: string;
    subdomain: string;
  };
  kpis: DashboardKpis;
  onboarding: {
    last_batch: DashboardLastBatch | null;
  };
  daily_checks_today: DashboardDailyChecksToday;
  monitoring_summary: DashboardMonitoringSummary;
  urgent_exceptions: DashboardAlertRecord[];
  fuel_entries_recent: DashboardRecentFuelEntry[];
  recent: {
    vehicles: DashboardRecentVehicle[];
    drivers: DashboardRecentDriver[];
    fuel_entries: DashboardRecentFuelEntry[];
    alerts: DashboardAlertRecord[];
  };
  scope_status?: ScopeStatus;
  request_id: string;
}

export interface FuelEntryRecord {
  id: string;
  entry_date: string;
  entry_time: string | null;
  odometer_km: number | null;
  liters: string;
  source_type: 'CARD' | 'TANK' | 'STATION' | 'MANUAL' | 'APPROVED_SOURCE';
  approved_source_context?: string | null;
  odometer_fallback_used?: boolean;
  odometer_fallback_reason?: string | null;
  notes: string | null;
  receipt_url: string | null;
  vehicle: {
    id: string;
    fleet_no: string;
    plate_no: string | null;
  };
  driver: {
    id: string;
    full_name: string;
  } | null;
  site: {
    id: string;
    site_code: string;
    site_name: string;
  } | null;
  created_at: string;
}

export interface FuelEntriesListResponse {
  items: FuelEntryRecord[];
  next_cursor: string | null;
  scope_status?: ScopeStatus;
  request_id: string;
}

export interface ChecklistMasterSection {
  section_code: string;
  section_name: string;
  sort_order: number;
  items: Array<{
    item_code: string;
    item_name: string;
    sort_order: number;
    required: boolean;
  }>;
}

export interface ChecklistMasterResponse {
  sections: ChecklistMasterSection[];
  request_id: string;
}

export interface DailyCheckListRecord {
  id: string;
  check_date: string;
  status: 'DRAFT' | 'SUBMITTED';
  vehicle: {
    id: string;
    fleet_no: string;
    plate_no: string | null;
  };
  site: {
    id: string;
    site_code: string;
    site_name: string;
  } | null;
  driver: {
    id: string;
    full_name: string;
  } | null;
  stats: {
    ok_count: number;
    not_ok_count: number;
    na_count: number;
    total_items: number;
  };
  signals: {
    critical_not_ok_count: number;
    repeated_issue_count_7d: number;
    vehicle_has_repeated_issues: boolean;
    driver_draft_count_7d: number;
  };
  created_at: string;
}

export interface DailyChecksListResponse {
  items: DailyCheckListRecord[];
  scope_status?: ScopeStatus;
  request_id: string;
}

export interface DailyCheckDetailsResponse {
  id: string;
  check_date: string;
  status: 'DRAFT' | 'SUBMITTED';
  vehicle: {
    id: string;
    fleet_no: string;
    plate_no: string | null;
  };
  site: {
    id: string;
    site_code: string;
    site_name: string;
  } | null;
  driver: {
    id: string;
    full_name: string;
  } | null;
  items: Array<{
    item_code: string;
    status: 'OK' | 'NOT_OK' | 'NA';
    notes: string | null;
    photo_url: string | null;
  }>;
  scope_status?: ScopeStatus;
  request_id: string;
}

export interface VehicleLookupRecord {
  id: string;
  fleet_no: string;
  plate_no: string | null;
  previous_odometer_km?: number | null;
  last_service_date?: string | null;
  last_service_odometer_km?: number | null;
  next_service_odometer_km?: number | null;
  service_interval_km?: number | null;
  is_active?: boolean;
  site: {
    id: string;
    site_code: string;
    site_name: string;
  } | null;
  assigned_driver?: {
    user_id: string | null;
    full_name: string;
  } | null;
}

export interface DriverLookupRecord {
  id: string;
  full_name: string;
  employee_no: string | null;
  username: string | null;
  is_active?: boolean;
  site?: {
    id: string;
    site_code: string;
    site_name: string;
  } | null;
  assigned_vehicle?: {
    id: string;
    fleet_no: string;
    plate_no: string | null;
  } | null;
}

export interface SiteLookupRecord {
  id: string;
  site_code: string;
  site_name: string;
  location: string | null;
  is_active: boolean;
}

export interface TankLookupRecord {
  id: string;
  tank_name: string;
  capacity_l: string;
  reorder_level_l: string;
  is_active?: boolean;
  site: {
    id: string;
    site_code: string;
    site_name: string;
  };
}

export type ComplianceAppliesTo = 'DRIVER' | 'VEHICLE';

export interface ComplianceTypeRecord {
  id: string;
  name: string;
  applies_to: ComplianceAppliesTo;
  requires_expiry: boolean;
  is_active: boolean;
  created_at: string;
}

export interface ComplianceRecordItem {
  id: string;
  applies_to: ComplianceAppliesTo;
  target_id: string;
  target_label: string;
  type: {
    id: string;
    name: string;
  };
  reference_number: string | null;
  issued_at: string | null;
  expiry_date: string | null;
  is_expired: boolean;
  is_expiring_soon: boolean;
  notes: string | null;
  evidence_url: string | null;
  created_at: string;
}

export interface ComplianceTypesListResponse {
  items: ComplianceTypeRecord[];
  request_id: string;
}

export interface ComplianceRecordsListResponse {
  items: ComplianceRecordItem[];
  scope_status?: ScopeStatus;
  request_id: string;
}

export interface TenantSettingsResponse {
  tenant: {
    id: string;
    name: string;
    status: TenantStatus;
    primary_subdomain: string;
    created_at: string;
  };
  auth: {
    actor_role: TenantLoginResponse['role'];
    actor_type: TenantLoginResponse['actor_type'];
  };
  scope_status?: ScopeStatus;
  features: {
    onboarding_import_enabled: boolean;
    fuel_submission_via_admin: false;
    daily_check_submission_via_admin: false;
  };
  notifications: {
    enabled: boolean;
    channels: {
      whatsapp: {
        enabled: boolean;
        integration_active: false;
        delivery_mode?: 'stub' | 'not_configured' | 'active';
      };
      email: {
        enabled: boolean;
      };
      sms: {
        enabled: boolean;
      };
    };
    recipient_scope: 'ALL_TENANT_OPERATIONS' | 'SITE_SUPERVISORS_ONLY' | 'CUSTOM';
    custom_recipients: Array<{
      label: string;
      value: string;
    }>;
    events: {
      missing_daily_check: boolean;
      critical_checklist_issue: boolean;
      fuel_missing_receipt: boolean;
      odometer_fallback_used: boolean;
      approved_source_used: boolean;
      high_priority_exceptions: boolean;
      compliance_expired: boolean;
      compliance_expiring_soon: boolean;
    };
  };
  request_id: string;
}

export interface UpdateTenantNotificationSettingsRequest {
  enabled: boolean;
  channels: {
    whatsapp: {
      enabled: boolean;
    };
    email: {
      enabled: boolean;
    };
    sms: {
      enabled: boolean;
    };
  };
  recipient_scope: 'ALL_TENANT_OPERATIONS' | 'SITE_SUPERVISORS_ONLY' | 'CUSTOM';
  custom_recipients: Array<{
    label: string;
    value: string;
  }>;
  events: {
    missing_daily_check: boolean;
    critical_checklist_issue: boolean;
    fuel_missing_receipt: boolean;
    odometer_fallback_used: boolean;
    approved_source_used: boolean;
    high_priority_exceptions: boolean;
    compliance_expired: boolean;
    compliance_expiring_soon: boolean;
  };
}

export type NotificationContactRole =
  | 'SITE_SUPERVISOR'
  | 'TRANSPORT_MANAGER'
  | 'HEAD_OFFICE_ADMIN'
  | 'CUSTOM';

export interface NotificationContactRecord {
  id: string;
  user_id: string | null;
  name: string;
  role: NotificationContactRole;
  phone_e164: string | null;
  email: string | null;
  is_active: boolean;
  sites: Array<{
    id: string;
    site_code: string;
    site_name: string;
  }>;
  created_at: string;
  updated_at: string;
}

export interface NotificationContactsListResponse {
  items: NotificationContactRecord[];
  request_id: string;
}

export interface CreateNotificationContactRequest {
  user_id?: string | null;
  name: string;
  role: NotificationContactRole;
  phone?: string | null;
  email?: string | null;
  is_active?: boolean;
}

export interface UpdateNotificationContactRequest {
  user_id?: string | null;
  name?: string;
  role?: NotificationContactRole;
  phone?: string | null;
  email?: string | null;
  is_active?: boolean;
}

export type NotificationPreviewEventType = 'COMPLIANCE_EXPIRED' | 'COMPLIANCE_EXPIRING_SOON';
export type NotificationPreviewReadinessStatus =
  | 'stub_mode'
  | 'provider_not_configured'
  | 'provider_ready_not_enabled'
  | 'ready_for_controlled_send';

export interface NotificationRecipientPreviewRecord {
  recipient: string;
  label: string;
  source: 'contact_directory' | 'legacy_settings';
  normalized_contact: string;
  contact_id: string | null;
  contact_role: NotificationContactRole | null;
  scope: 'TENANT_WIDE' | 'SITE_SCOPED';
  site_ids: string[];
}

export interface NotificationRecipientsPreviewResponse {
  event_type: NotificationPreviewEventType;
  scope: 'TENANT' | 'SITE';
  site_id: string | null;
  resolved_recipients: NotificationRecipientPreviewRecord[];
  resolution: {
    source: 'contact_directory' | 'legacy_settings' | 'none';
    fallback_used: boolean;
  };
  provider_readiness: {
    status: NotificationPreviewReadinessStatus;
    provider: string;
    delivery_enabled: boolean;
    configured: boolean;
    real_send_allowed_in_env: boolean;
  };
  request_id: string;
}

export type DriverFuelSourceType = 'station' | 'tank' | 'card' | 'approved_source';

export interface DriverDashboardResponse {
  driver: {
    id: string;
    full_name: string;
    employee_no: string | null;
    username: string | null;
  };
  assignment: {
    site: {
      id: string;
      site_code: string;
      site_name: string;
    } | null;
    vehicle: {
      id: string;
      fleet_no: string;
      plate_no: string | null;
    } | null;
  };
  today: {
    date: string;
    has_submitted_daily_check: boolean;
    fuel_entries_count: number;
  };
  request_id: string;
}

export type OperatorQuestionType =
  | 'onboarding_failure'
  | 'driver_vehicle_visibility'
  | 'missing_daily_checks_zero'
  | 'last_deployment_changes'
  | 'known_issue_check'
  | 'service_inspection_priority'
  | 'general';

export type OperatorRiskLevel = 'low' | 'medium' | 'high';
export type OperatorConfidence = 'low' | 'medium' | 'high';

export interface OperatorAssistantRequest {
  question: string;
  tenant_subdomain?: string;
}

export interface OperatorAssistantEvidence {
  source: string;
  path: string;
  excerpt: string;
}

export interface OperatorAssistantResponse {
  question: string;
  question_type: OperatorQuestionType;
  likely_cause: string;
  evidence: OperatorAssistantEvidence[];
  affected_services: Array<'api' | 'admin-web' | 'driver-pwa' | 'database' | 'deployment'>;
  likely_modules: string[];
  known_previous_incidents: string[];
  recent_relevant_changes: string[];
  next_checks: string[];
  risk_level: OperatorRiskLevel;
  confidence: OperatorConfidence;
  uncertain: boolean;
  status_snapshot: {
    api: 'assumed_healthy';
    database: 'reachable' | 'unreachable';
  };
  request_id: string;
}
