import { z } from 'zod';

const uuidSchema = z.string().uuid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD.');
const isoDateTimeSchema = z.string().datetime({ offset: true }).or(z.string().datetime());

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
    hint: z.string().optional(),
  }),
  request_id: z.string().optional(),
});

export const tenantedHealthResponseSchema = z.object({
  status: z.literal('ok'),
  tenant_id: uuidSchema,
  subdomain: z.string(),
  request_id: z.string(),
});

export const tenantedSystemStatusResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  environment: z.object({
    name: z.enum(['development', 'test', 'production']),
    app_version: z.string(),
    build_sha: z.string().nullable(),
  }),
  services: z.object({
    api: z.object({
      reachable: z.literal(true),
    }),
    database: z.object({
      reachable: z.boolean(),
      error: z.string().optional(),
    }),
    notifications: z.object({
      mode: z.enum(['stub', 'meta_cloud_api', 'twilio_whatsapp']),
      readiness: z.enum([
        'stub_mode',
        'provider_not_configured',
        'provider_ready_not_enabled',
        'ready_for_controlled_send',
      ]),
      delivery_enabled: z.boolean(),
    }),
  }),
  readiness: z.object({
    config_ready: z.boolean(),
    migration_ready: z.boolean(),
    missing_tables: z.array(z.string()),
  }),
  request_id: z.string(),
});

const dashboardRecentFuelEntrySchema = z.object({
  id: uuidSchema,
  entry_date: dateSchema,
  entry_time: z.string().nullable(),
  liters: z.string(),
  odometer_km: z.number().int().nonnegative().nullable(),
  source_type: z.enum(['CARD', 'TANK', 'STATION', 'MANUAL', 'APPROVED_SOURCE']),
  approved_source_context: z.string().nullable().optional(),
  odometer_fallback_used: z.boolean().optional(),
  odometer_fallback_reason: z.string().nullable().optional(),
  vehicle: z.object({
    id: uuidSchema,
    fleet_no: z.string(),
    plate_no: z.string().nullable(),
  }),
  driver: z
    .object({
      id: uuidSchema,
      full_name: z.string(),
    })
    .nullable(),
  created_at: isoDateTimeSchema,
});

const dashboardSummaryAlertSeveritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH']);
const dashboardSummaryAlertTypeSchema = z.enum([
  'missing_daily_check',
  'checklist_issue_reported',
  'critical_checklist_issue',
  'repeated_checklist_issues_vehicle',
  'driver_frequent_skips',
  'compliance_expiring_soon',
  'compliance_expired',
  'fuel_missing_receipt',
  'fuel_used_odometer_fallback',
  'fuel_used_approved_source',
  'suspicious_high_liters',
  'suspicious_high_liters_vs_distance',
  'suspicious_repeat_fuel',
  'fueling_too_soon_after_previous_fill',
  'suspicious_consumption_deviation',
  'suspicious_high_risk_combination',
]);

const scopeStatusSchema = z.enum(['full_tenant_scope', 'site_scope_limited', 'no_site_scope_assigned']);

const dashboardSummaryAlertRecordSchema = z.object({
  id: z.string(),
  alert_type: dashboardSummaryAlertTypeSchema,
  severity: dashboardSummaryAlertSeveritySchema,
  occurred_at: isoDateTimeSchema,
  vehicle: z
    .object({
      id: uuidSchema,
      fleet_no: z.string(),
      plate_no: z.string().nullable(),
    })
    .nullable(),
  driver: z
    .object({
      id: uuidSchema,
      full_name: z.string(),
    })
    .nullable(),
  site: z
    .object({
      id: uuidSchema,
      site_code: z.string(),
      site_name: z.string(),
    })
    .nullable(),
  reason: z.string(),
  related_record_id: uuidSchema.nullable(),
  anomaly_details: z
    .object({
      previous_odometer_km: z.number().int().nullable().optional(),
      current_odometer_km: z.number().int().nullable().optional(),
      distance_km: z.number().nullable().optional(),
      expected_km_per_l: z.number().nullable().optional(),
      expected_liters: z.number().nullable().optional(),
      actual_liters: z.number().nullable().optional(),
      deviation_pct: z.number().nullable().optional(),
      risk_score: z.number().nullable().optional(),
    })
    .optional(),
  action: z.object({
    label: z.string(),
    target: z.string(),
  }),
});

export const tenantDashboardSummaryResponseSchema = z.object({
  tenant: z.object({
    id: uuidSchema,
    subdomain: z.string(),
  }),
  kpis: z.object({
    vehicles_total: z.number().int().nonnegative(),
    drivers_total: z.number().int().nonnegative(),
    fuel_cards_total: z.number().int().nonnegative(),
    sites_total: z.number().int().nonnegative(),
    tanks_total: z.number().int().nonnegative(),
  }),
  onboarding: z.object({
    last_batch: z
      .object({
        id: uuidSchema,
        status: z.enum(['UPLOADED', 'PREVIEWED', 'COMMITTED', 'FAILED']),
        created_at: isoDateTimeSchema,
        committed_at: isoDateTimeSchema.nullable(),
        counts: z.object({
          sites: z.number().int().nonnegative(),
          drivers: z.number().int().nonnegative(),
          vehicles: z.number().int().nonnegative(),
          fuel_cards: z.number().int().nonnegative(),
          tanks: z.number().int().nonnegative(),
          equipment: z.number().int().nonnegative(),
        }),
      })
      .nullable(),
  }),
  daily_checks_today: z.object({
    submitted_count: z.number().int().nonnegative(),
    pending_count: z.number().int().nonnegative(),
  }),
  monitoring_summary: z.object({
    vehicles_missing_daily_check: z.number().int().nonnegative(),
    high_risk_fuel_alerts: z.number().int().nonnegative(),
    compliance_expired: z.number().int().nonnegative(),
    compliance_expiring_soon: z.number().int().nonnegative(),
    receipt_gaps: z.number().int().nonnegative(),
    checklist_issues_today: z.number().int().nonnegative(),
    fuel_entries_today: z.number().int().nonnegative(),
    fuel_missing_receipt: z.number().int().nonnegative(),
    fuel_odometer_fallback: z.number().int().nonnegative(),
    approved_source_usage: z.number().int().nonnegative(),
    high_priority_exceptions: z.number().int().nonnegative(),
    total_alerts: z.number().int().nonnegative(),
  }),
  urgent_exceptions: z.array(dashboardSummaryAlertRecordSchema),
  fuel_entries_recent: z.array(dashboardRecentFuelEntrySchema),
  recent: z.object({
    vehicles: z.array(
      z.object({
        id: uuidSchema,
        fleet_number: z.string(),
        plate_number: z.string().nullable(),
        vehicle_type: z.string().nullable(),
        site_code: z.string().nullable(),
        created_at: isoDateTimeSchema,
      }),
    ),
    drivers: z.array(
      z.object({
        id: uuidSchema,
        employee_no: z.string().nullable(),
        username: z.string().nullable(),
        full_name: z.string(),
        role: z.enum(['DRIVER', 'SITE_SUPERVISOR']),
        created_at: isoDateTimeSchema,
      }),
    ),
    fuel_entries: z.array(dashboardRecentFuelEntrySchema),
    alerts: z.array(dashboardSummaryAlertRecordSchema),
  }),
  scope_status: scopeStatusSchema.optional(),
  request_id: z.string(),
});

export const dashboardAlertSeveritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH']);
export const dashboardAlertTypeSchema = z.enum([
  'missing_daily_check',
  'checklist_issue_reported',
  'critical_checklist_issue',
  'repeated_checklist_issues_vehicle',
  'driver_frequent_skips',
  'compliance_expiring_soon',
  'compliance_expired',
  'fuel_missing_receipt',
  'fuel_used_odometer_fallback',
  'fuel_used_approved_source',
  'suspicious_high_liters',
  'suspicious_high_liters_vs_distance',
  'suspicious_repeat_fuel',
  'fueling_too_soon_after_previous_fill',
  'suspicious_consumption_deviation',
  'suspicious_high_risk_combination',
]);

export const dashboardAlertsQuerySchema = z.object({
  date: dateSchema.optional(),
  severity: dashboardAlertSeveritySchema.optional(),
  alert_type: dashboardAlertTypeSchema.optional(),
  vehicle_id: uuidSchema.optional(),
  driver_id: uuidSchema.optional(),
  site_id: uuidSchema.optional(),
});

export const dashboardAlertRecordSchema = z.object({
  id: z.string(),
  alert_type: dashboardAlertTypeSchema,
  severity: dashboardAlertSeveritySchema,
  occurred_at: isoDateTimeSchema,
  vehicle: z
    .object({
      id: uuidSchema,
      fleet_no: z.string(),
      plate_no: z.string().nullable(),
    })
    .nullable(),
  driver: z
    .object({
      id: uuidSchema,
      full_name: z.string(),
    })
    .nullable(),
  site: z
    .object({
      id: uuidSchema,
      site_code: z.string(),
      site_name: z.string(),
    })
    .nullable(),
  reason: z.string(),
  related_record_id: uuidSchema.nullable(),
  anomaly_details: z
    .object({
      previous_odometer_km: z.number().int().nullable().optional(),
      current_odometer_km: z.number().int().nullable().optional(),
      distance_km: z.number().nullable().optional(),
      expected_km_per_l: z.number().nullable().optional(),
      expected_liters: z.number().nullable().optional(),
      actual_liters: z.number().nullable().optional(),
      deviation_pct: z.number().nullable().optional(),
      risk_score: z.number().nullable().optional(),
    })
    .optional(),
  action: z.object({
    label: z.string(),
    target: z.string(),
  }),
});

export const dashboardAlertsResponseSchema = z.object({
  tenant: z.object({
    id: uuidSchema,
    subdomain: z.string(),
  }),
  summary: z.object({
    date: dateSchema,
    vehicles_missing_daily_check: z.number().int().nonnegative(),
    checklist_issues_today: z.number().int().nonnegative(),
    fuel_entries_today: z.number().int().nonnegative(),
    high_priority_exceptions: z.number().int().nonnegative(),
    total_alerts: z.number().int().nonnegative(),
  }),
  items: z.array(dashboardAlertRecordSchema),
  scope_status: scopeStatusSchema.optional(),
  request_id: z.string(),
});

export const createFuelEntryRequestSchema = z
  .object({
    vehicle_id: uuidSchema.optional(),
    fleet_no: z.string().trim().min(1).optional(),
    driver_id: uuidSchema.optional(),
    site_id: uuidSchema.optional(),
    entry_date: dateSchema,
    entry_time: z
      .string()
      .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Entry time must be HH:mm.')
      .optional(),
    odometer_km: z.coerce.number().int().min(0).optional(),
    liters: z.coerce.number().positive(),
    source_type: z.enum(['CARD', 'TANK', 'STATION', 'MANUAL', 'APPROVED_SOURCE']),
    fuel_card_id: uuidSchema.optional(),
    tank_id: uuidSchema.optional(),
    fuel_station_id: z.string().trim().min(1).optional(),
    approved_source_context: z.string().trim().min(3).max(500).optional(),
    odometer_fallback_used: z.boolean().default(false),
    odometer_fallback_reason: z.string().trim().min(3).max(500).optional(),
    receipt_url: z.string().trim().url().optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.vehicle_id && !value.fleet_no) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['vehicle_id'],
        message: 'vehicle_id or fleet_no is required.',
      });
    }

    if (value.source_type === 'CARD' && !value.fuel_card_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fuel_card_id'],
        message: 'fuel_card_id is required when source_type is CARD.',
      });
    }

    if (value.source_type === 'TANK' && !value.tank_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['tank_id'],
        message: 'tank_id is required when source_type is TANK.',
      });
    }

    if (value.source_type === 'STATION' && !value.fuel_station_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fuel_station_id'],
        message: 'fuel_station_id is required when source_type is STATION.',
      });
    }

    if (value.source_type === 'APPROVED_SOURCE' && !value.approved_source_context) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['approved_source_context'],
        message: 'approved_source_context is required when source_type is APPROVED_SOURCE.',
      });
    }

    if (!value.odometer_fallback_used && typeof value.odometer_km !== 'number') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['odometer_km'],
        message: 'odometer_km is required unless odometer_fallback_used is true.',
      });
    }

    if (value.odometer_fallback_used && !value.odometer_fallback_reason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['odometer_fallback_reason'],
        message: 'odometer_fallback_reason is required when odometer_fallback_used is true.',
      });
    }
  });

export const fuelEntriesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: uuidSchema.optional(),
  related_record_id: uuidSchema.optional(),
  vehicle_id: uuidSchema.optional(),
  driver_id: uuidSchema.optional(),
  site_id: uuidSchema.optional(),
  source_type: z.enum(['CARD', 'TANK', 'STATION', 'MANUAL', 'APPROVED_SOURCE']).optional(),
  missing_receipt_only: z
    .union([z.boolean(), z.literal('true'), z.literal('false')])
    .transform((value) => {
      if (value === 'true') {
        return true;
      }
      if (value === 'false') {
        return false;
      }
      return value;
    })
    .optional(),
  fallback_used: z
    .union([z.boolean(), z.literal('true'), z.literal('false')])
    .transform((value) => {
      if (value === 'true') {
        return true;
      }
      if (value === 'false') {
        return false;
      }
      return value;
    })
    .optional(),
  from: dateSchema.optional(),
  to: dateSchema.optional(),
});

export const fuelEntryRecordSchema = z.object({
  id: uuidSchema,
  entry_date: dateSchema,
  entry_time: z.string().nullable(),
  odometer_km: z.number().int().nonnegative().nullable(),
  liters: z.string(),
  source_type: z.enum(['CARD', 'TANK', 'STATION', 'MANUAL', 'APPROVED_SOURCE']),
  approved_source_context: z.string().nullable().optional(),
  odometer_fallback_used: z.boolean().optional(),
  odometer_fallback_reason: z.string().nullable().optional(),
  notes: z.string().nullable(),
  receipt_url: z.string().nullable(),
  vehicle: z.object({
    id: uuidSchema,
    fleet_no: z.string(),
    plate_no: z.string().nullable(),
  }),
  driver: z
    .object({
      id: uuidSchema,
      full_name: z.string(),
    })
    .nullable(),
  site: z
    .object({
      id: uuidSchema,
      site_code: z.string(),
      site_name: z.string(),
    })
    .nullable(),
  created_at: isoDateTimeSchema,
});

export const fuelEntriesListResponseSchema = z.object({
  items: z.array(fuelEntryRecordSchema),
  next_cursor: uuidSchema.nullable(),
  scope_status: scopeStatusSchema.optional(),
  request_id: z.string(),
});

export const driverFuelSourceTypeSchema = z.enum(['station', 'tank', 'card', 'approved_source']);

export const driverLoginResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.literal('Bearer'),
  expires_in: z.string(),
  tenant_id: uuidSchema,
  role: z.literal('DRIVER'),
  actor_type: z.literal('DRIVER'),
});

export const driverDashboardResponseSchema = z.object({
  driver: z.object({
    id: uuidSchema,
    full_name: z.string(),
    employee_no: z.string().nullable(),
    username: z.string().nullable(),
  }),
  assignment: z.object({
    site: z
      .object({
        id: uuidSchema,
        site_code: z.string(),
        site_name: z.string(),
      })
      .nullable(),
    vehicle: z
      .object({
        id: uuidSchema,
        fleet_no: z.string(),
        plate_no: z.string().nullable(),
      })
      .nullable(),
  }),
  today: z.object({
    date: dateSchema,
    has_submitted_daily_check: z.boolean(),
    fuel_entries_count: z.number().int().nonnegative(),
  }),
  request_id: z.string(),
});

export const createDriverDailyCheckRequestSchema = z.object({
  check_date: dateSchema,
  vehicle_id: uuidSchema.optional(),
  odometer_km: z.coerce.number().int().min(0).optional(),
  odometer_fallback_used: z.boolean().default(false),
  odometer_fallback_reason: z.string().trim().min(3).max(500).optional(),
});

export const createDriverFuelEntryRequestSchema = z
  .object({
    vehicle_id: uuidSchema.optional(),
    entry_date: dateSchema,
    entry_time: z
      .string()
      .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Entry time must be HH:mm.')
      .optional(),
    odometer_km: z.coerce.number().int().min(0).optional(),
    odometer_fallback_used: z.boolean().default(false),
    odometer_fallback_reason: z.string().trim().min(3).max(500).optional(),
    liters: z.coerce.number().positive(),
    source_type: driverFuelSourceTypeSchema,
    fuel_card_id: uuidSchema.optional(),
    tank_id: uuidSchema.optional(),
    fuel_station_id: z.string().trim().min(1).optional(),
    approved_source_context: z.string().trim().min(3).max(500).optional(),
    receipt_url: z.string().trim().url().optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.source_type === 'card' && !value.fuel_card_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fuel_card_id'],
        message: 'fuel_card_id is required when source_type is card.',
      });
    }
    if (value.source_type === 'tank' && !value.tank_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['tank_id'],
        message: 'tank_id is required when source_type is tank.',
      });
    }
    if (value.source_type === 'station' && !value.fuel_station_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fuel_station_id'],
        message: 'fuel_station_id is required when source_type is station.',
      });
    }
    if (value.source_type === 'approved_source' && !value.approved_source_context) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['approved_source_context'],
        message: 'approved_source_context is required when source_type is approved_source.',
      });
    }
    if (!value.odometer_fallback_used && typeof value.odometer_km !== 'number') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['odometer_km'],
        message: 'odometer_km is required unless odometer_fallback_used is true.',
      });
    }
    if (value.odometer_fallback_used && !value.odometer_fallback_reason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['odometer_fallback_reason'],
        message: 'odometer_fallback_reason is required when odometer_fallback_used is true.',
      });
    }
  });

export const checklistsMasterResponseSchema = z.object({
  sections: z.array(
    z.object({
      section_code: z.string(),
      section_name: z.string(),
      sort_order: z.number().int(),
      items: z.array(
        z.object({
          item_code: z.string(),
          item_name: z.string(),
          sort_order: z.number().int(),
          required: z.boolean(),
        }),
      ),
    }),
  ),
  request_id: z.string(),
});

export const createDailyCheckRequestSchema = z.object({
  vehicle_id: uuidSchema,
  driver_id: uuidSchema.optional(),
  site_id: uuidSchema.optional(),
  check_date: dateSchema,
});

export const submitDailyCheckItemSchema = z.object({
  item_code: z.string().trim().min(1),
  status: z.enum(['OK', 'NOT_OK', 'NA']),
  notes: z.string().trim().max(500).optional(),
  photo_url: z.string().trim().url().optional(),
});

export const submitDailyCheckRequestSchema = z.object({
  items: z.array(submitDailyCheckItemSchema).min(1),
});

export const dailyChecksQuerySchema = z.object({
  related_record_id: uuidSchema.optional(),
  date: dateSchema.optional(),
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  vehicle_id: uuidSchema.optional(),
  driver_id: uuidSchema.optional(),
  site_id: uuidSchema.optional(),
  status: z.enum(['DRAFT', 'SUBMITTED']).optional(),
  skip_only: z
    .union([z.boolean(), z.literal('true'), z.literal('false')])
    .transform((value) => (value === 'true' ? true : value === 'false' ? false : value))
    .optional(),
  issue_only: z
    .union([z.boolean(), z.literal('true'), z.literal('false')])
    .transform((value) => (value === 'true' ? true : value === 'false' ? false : value))
    .optional(),
  critical_only: z
    .union([z.boolean(), z.literal('true'), z.literal('false')])
    .transform((value) => (value === 'true' ? true : value === 'false' ? false : value))
    .optional(),
  repeated_vehicle_only: z
    .union([z.boolean(), z.literal('true'), z.literal('false')])
    .transform((value) => (value === 'true' ? true : value === 'false' ? false : value))
    .optional(),
});

const dailyCheckListRecordSchema = z.object({
  id: uuidSchema,
  check_date: dateSchema,
  status: z.enum(['DRAFT', 'SUBMITTED']),
  vehicle: z.object({
    id: uuidSchema,
    fleet_no: z.string(),
    plate_no: z.string().nullable(),
  }),
  site: z
    .object({
      id: uuidSchema,
      site_code: z.string(),
      site_name: z.string(),
    })
    .nullable(),
  driver: z
    .object({
      id: uuidSchema,
      full_name: z.string(),
    })
    .nullable(),
  stats: z.object({
    ok_count: z.number().int().nonnegative(),
    not_ok_count: z.number().int().nonnegative(),
    na_count: z.number().int().nonnegative(),
    total_items: z.number().int().nonnegative(),
  }),
  signals: z.object({
    critical_not_ok_count: z.number().int().nonnegative(),
    repeated_issue_count_7d: z.number().int().nonnegative(),
    vehicle_has_repeated_issues: z.boolean(),
    driver_draft_count_7d: z.number().int().nonnegative(),
  }),
  created_at: isoDateTimeSchema,
});

export const dailyChecksListResponseSchema = z.object({
  items: z.array(dailyCheckListRecordSchema),
  scope_status: scopeStatusSchema.optional(),
  request_id: z.string(),
});

export const dailyCheckDetailsResponseSchema = z.object({
  id: uuidSchema,
  check_date: dateSchema,
  status: z.enum(['DRAFT', 'SUBMITTED']),
  vehicle: z.object({
    id: uuidSchema,
    fleet_no: z.string(),
    plate_no: z.string().nullable(),
  }),
  site: z
    .object({
      id: uuidSchema,
      site_code: z.string(),
      site_name: z.string(),
    })
    .nullable(),
  driver: z
    .object({
      id: uuidSchema,
      full_name: z.string(),
    })
    .nullable(),
  items: z.array(
    z.object({
      item_code: z.string(),
      status: z.enum(['OK', 'NOT_OK', 'NA']),
      notes: z.string().nullable(),
      photo_url: z.string().nullable(),
    }),
  ),
  scope_status: scopeStatusSchema.optional(),
  request_id: z.string(),
});

const notificationRecipientSchema = z.object({
  label: z.string().trim().min(1).max(100),
  value: z.string().trim().min(1).max(200),
});

export const notificationContactRoleSchema = z.enum([
  'SITE_SUPERVISOR',
  'TRANSPORT_MANAGER',
  'HEAD_OFFICE_ADMIN',
  'CUSTOM',
]);

export const updateTenantNotificationSettingsRequestSchema = z
  .object({
    enabled: z.boolean(),
    channels: z.object({
      whatsapp: z.object({
        enabled: z.boolean(),
      }),
      email: z.object({
        enabled: z.boolean(),
      }),
      sms: z.object({
        enabled: z.boolean(),
      }),
    }),
    recipient_scope: z.enum(['ALL_TENANT_OPERATIONS', 'SITE_SUPERVISORS_ONLY', 'CUSTOM']),
    custom_recipients: z.array(notificationRecipientSchema).max(50),
    events: z.object({
      missing_daily_check: z.boolean(),
      critical_checklist_issue: z.boolean(),
      fuel_missing_receipt: z.boolean(),
      odometer_fallback_used: z.boolean(),
      approved_source_used: z.boolean(),
      high_priority_exceptions: z.boolean(),
      compliance_expired: z.boolean(),
      compliance_expiring_soon: z.boolean(),
    }),
  })
  .superRefine((value, ctx) => {
    if (value.recipient_scope === 'CUSTOM' && value.custom_recipients.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one custom recipient is required when recipient_scope is CUSTOM.',
        path: ['custom_recipients'],
      });
    }

    if (value.recipient_scope !== 'CUSTOM' && value.custom_recipients.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Custom recipients must be empty unless recipient_scope is CUSTOM.',
        path: ['custom_recipients'],
      });
    }
  });

export const createNotificationContactRequestSchema = z
  .object({
    user_id: uuidSchema.nullable().optional(),
    name: z.string().trim().min(1).max(120),
    role: notificationContactRoleSchema,
    phone: z.string().trim().min(1).max(32).nullable().optional(),
    email: z.string().trim().email().max(160).nullable().optional(),
    is_active: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    if (!value.phone && !value.email) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one contact channel (phone or email) is required.',
        path: ['phone'],
      });
    }
  });

export const updateNotificationContactRequestSchema = z
  .object({
    user_id: uuidSchema.nullable().optional(),
    name: z.string().trim().min(1).max(120).optional(),
    role: notificationContactRoleSchema.optional(),
    phone: z.string().trim().min(1).max(32).nullable().optional(),
    email: z.string().trim().email().max(160).nullable().optional(),
    is_active: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided.',
  });

export const notificationContactAssignmentRequestSchema = z.object({
  site_id: uuidSchema,
});

export const complianceAppliesToSchema = z.enum(['DRIVER', 'VEHICLE']);

export const createComplianceTypeRequestSchema = z.object({
  name: z.string().trim().min(2).max(120),
  applies_to: complianceAppliesToSchema,
  requires_expiry: z.boolean().default(true),
});

export const updateComplianceTypeRequestSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    requires_expiry: z.boolean().optional(),
    is_active: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided.',
  });

export const complianceRecordsQuerySchema = z.object({
  applies_to: complianceAppliesToSchema.optional(),
  driver_id: uuidSchema.optional(),
  vehicle_id: uuidSchema.optional(),
  expiring_within_days: z.coerce.number().int().min(1).max(365).optional(),
});

export const createComplianceRecordRequestSchema = z
  .object({
    applies_to: complianceAppliesToSchema,
    target_id: uuidSchema,
    compliance_type_id: uuidSchema,
    reference_number: z.string().trim().min(1).max(120).optional(),
    issued_at: dateSchema.optional(),
    expiry_date: dateSchema.optional(),
    notes: z.string().trim().max(500).optional(),
    evidence_url: z.string().trim().url().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.issued_at && value.expiry_date && value.expiry_date < value.issued_at) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expiry_date'],
        message: 'expiry_date must be on or after issued_at.',
      });
    }
  });

export type CreateFuelEntryRequest = z.infer<typeof createFuelEntryRequestSchema>;
export type FuelEntriesQuery = z.infer<typeof fuelEntriesQuerySchema>;
export type CreateDailyCheckRequest = z.infer<typeof createDailyCheckRequestSchema>;
export type SubmitDailyCheckRequest = z.infer<typeof submitDailyCheckRequestSchema>;
export type DailyChecksQuery = z.infer<typeof dailyChecksQuerySchema>;
export type CreateDriverFuelEntryRequest = z.infer<typeof createDriverFuelEntryRequestSchema>;
export type CreateDriverDailyCheckRequest = z.infer<typeof createDriverDailyCheckRequestSchema>;
export type DashboardAlertsQuery = z.infer<typeof dashboardAlertsQuerySchema>;
export type CreateComplianceTypeRequest = z.infer<typeof createComplianceTypeRequestSchema>;
export type UpdateComplianceTypeRequest = z.infer<typeof updateComplianceTypeRequestSchema>;
export type CreateComplianceRecordRequest = z.infer<typeof createComplianceRecordRequestSchema>;
export type ComplianceRecordsQuery = z.infer<typeof complianceRecordsQuerySchema>;
