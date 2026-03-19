import type {
  TenantSettingsResponse,
  UpdateTenantNotificationSettingsRequest,
} from '@fleet-fuel/shared';
import type { AuthContext, DataScopeContext, TenantContext } from '../types/http';
import { NotificationRecipientScope } from '@prisma/client';

import { prisma } from '../db/prisma';
import { AppError } from '../utils/errors';
import { getNotificationDeliveryMode } from './notification-dispatch.service';

function defaultNotifications(): TenantSettingsResponse['notifications'] {
  return {
    enabled: false,
    channels: {
      whatsapp: {
        enabled: false,
        integration_active: false,
        delivery_mode: getNotificationDeliveryMode(),
      },
      email: {
        enabled: false,
      },
      sms: {
        enabled: false,
      },
    },
    recipient_scope: 'ALL_TENANT_OPERATIONS',
    custom_recipients: [],
    events: {
      missing_daily_check: true,
      critical_checklist_issue: true,
      fuel_missing_receipt: true,
      odometer_fallback_used: true,
      approved_source_used: true,
      high_priority_exceptions: true,
      compliance_expired: true,
      compliance_expiring_soon: true,
    },
  };
}

function mapNotificationSettings(row: {
  notificationsEnabled: boolean;
  whatsappEnabled: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
  recipientScope: NotificationRecipientScope;
  customRecipients: unknown;
  eventMissingDailyCheck: boolean;
  eventCriticalChecklistIssue: boolean;
  eventFuelMissingReceipt: boolean;
  eventOdometerFallbackUsed: boolean;
  eventApprovedSourceUsed: boolean;
  eventHighPriorityExceptions: boolean;
  eventComplianceExpired: boolean;
  eventComplianceExpiringSoon: boolean;
} | null): TenantSettingsResponse['notifications'] {
  if (!row) {
    return defaultNotifications();
  }

  const rawRecipients = Array.isArray(row.customRecipients) ? row.customRecipients : [];
  const customRecipients = rawRecipients
    .map((item) => {
      const value = item as { label?: unknown; value?: unknown };
      if (typeof value.label !== 'string' || typeof value.value !== 'string') {
        return null;
      }
      return {
        label: value.label,
        value: value.value,
      };
    })
    .filter((item): item is { label: string; value: string } => Boolean(item));

  return {
    enabled: row.notificationsEnabled,
    channels: {
      whatsapp: {
        enabled: row.whatsappEnabled,
        integration_active: false,
        delivery_mode: getNotificationDeliveryMode(),
      },
      email: {
        enabled: row.emailEnabled,
      },
      sms: {
        enabled: row.smsEnabled,
      },
    },
    recipient_scope: row.recipientScope,
    custom_recipients: customRecipients,
    events: {
      missing_daily_check: row.eventMissingDailyCheck,
      critical_checklist_issue: row.eventCriticalChecklistIssue,
      fuel_missing_receipt: row.eventFuelMissingReceipt,
      odometer_fallback_used: row.eventOdometerFallbackUsed,
      approved_source_used: row.eventApprovedSourceUsed,
      high_priority_exceptions: row.eventHighPriorityExceptions,
      compliance_expired: row.eventComplianceExpired,
      compliance_expiring_soon: row.eventComplianceExpiringSoon,
    },
  };
}

function canManageNotifications(role: AuthContext['role']) {
  return ['TENANT_ADMIN', 'COMPANY_ADMIN', 'SUPERVISOR', 'TRANSPORT_MANAGER', 'HEAD_OFFICE_ADMIN'].includes(role);
}

export function ensureCanViewNotificationConfiguration(auth: AuthContext, scope: DataScopeContext) {
  if (!canManageNotifications(auth.role)) {
    throw new AppError(403, 'forbidden_settings_read', 'Your role cannot access tenant notification configuration.');
  }
  if (!scope.isFullTenantScope) {
    throw new AppError(
      403,
      'forbidden_settings_read',
      'Site-scoped users cannot access tenant-wide notification configuration.',
    );
  }
}

export async function getTenantSettings(
  tenant: TenantContext,
  auth: AuthContext,
  scope: DataScopeContext,
  requestId: string,
): Promise<TenantSettingsResponse> {
  const tenantWithDomain = await prisma.tenant.findUnique({
    where: { id: tenant.id },
    include: {
      domains: {
        where: { isPrimary: true },
        take: 1,
      },
      notificationSettings: {
        select: {
          notificationsEnabled: true,
          whatsappEnabled: true,
          emailEnabled: true,
          smsEnabled: true,
          recipientScope: true,
          customRecipients: true,
          eventMissingDailyCheck: true,
          eventCriticalChecklistIssue: true,
          eventFuelMissingReceipt: true,
          eventOdometerFallbackUsed: true,
          eventApprovedSourceUsed: true,
          eventHighPriorityExceptions: true,
          eventComplianceExpired: true,
          eventComplianceExpiringSoon: true,
        },
      },
    },
  });

  if (!tenantWithDomain) {
    throw new AppError(404, 'tenant_not_found', 'Tenant could not be resolved from host.');
  }

  return {
    tenant: {
      id: tenantWithDomain.id,
      name: tenantWithDomain.name,
      status: tenantWithDomain.status,
      primary_subdomain: tenantWithDomain.domains[0]?.subdomain ?? tenant.subdomain,
      created_at: tenantWithDomain.createdAt.toISOString(),
    },
    auth: {
      actor_role: auth.role as TenantSettingsResponse['auth']['actor_role'],
      actor_type: auth.actor_type as 'STAFF' | 'DRIVER',
    },
    features: {
      onboarding_import_enabled: true,
      fuel_submission_via_admin: false,
      daily_check_submission_via_admin: false,
    },
    notifications: mapNotificationSettings(tenantWithDomain.notificationSettings),
    scope_status: scope.scopeStatus,
    request_id: requestId,
  };
}

export async function updateTenantNotificationSettings(
  tenant: TenantContext,
  auth: AuthContext,
  scope: DataScopeContext,
  payload: UpdateTenantNotificationSettingsRequest,
  requestId: string,
): Promise<TenantSettingsResponse> {
  if (!canManageNotifications(auth.role)) {
    throw new AppError(403, 'forbidden_settings_update', 'Your role cannot update tenant notification settings.');
  }
  if (!scope.isFullTenantScope) {
    throw new AppError(
      403,
      'forbidden_settings_update',
      'Site-scoped users cannot update tenant-wide notification settings.',
    );
  }

  await prisma.tenantNotificationSettings.upsert({
    where: {
      tenantId: tenant.id,
    },
    update: {
      notificationsEnabled: payload.enabled,
      whatsappEnabled: payload.channels.whatsapp.enabled,
      emailEnabled: payload.channels.email.enabled,
      smsEnabled: payload.channels.sms.enabled,
      recipientScope: payload.recipient_scope,
      customRecipients: payload.custom_recipients,
      eventMissingDailyCheck: payload.events.missing_daily_check,
      eventCriticalChecklistIssue: payload.events.critical_checklist_issue,
      eventFuelMissingReceipt: payload.events.fuel_missing_receipt,
      eventOdometerFallbackUsed: payload.events.odometer_fallback_used,
      eventApprovedSourceUsed: payload.events.approved_source_used,
      eventHighPriorityExceptions: payload.events.high_priority_exceptions,
      eventComplianceExpired: payload.events.compliance_expired,
      eventComplianceExpiringSoon: payload.events.compliance_expiring_soon,
      providerConfig: {
        integration_active: false,
        whatsapp_provider: null,
        note: 'Provider integration not yet active.',
      },
    },
    create: {
      tenantId: tenant.id,
      notificationsEnabled: payload.enabled,
      whatsappEnabled: payload.channels.whatsapp.enabled,
      emailEnabled: payload.channels.email.enabled,
      smsEnabled: payload.channels.sms.enabled,
      recipientScope: payload.recipient_scope,
      customRecipients: payload.custom_recipients,
      eventMissingDailyCheck: payload.events.missing_daily_check,
      eventCriticalChecklistIssue: payload.events.critical_checklist_issue,
      eventFuelMissingReceipt: payload.events.fuel_missing_receipt,
      eventOdometerFallbackUsed: payload.events.odometer_fallback_used,
      eventApprovedSourceUsed: payload.events.approved_source_used,
      eventHighPriorityExceptions: payload.events.high_priority_exceptions,
      eventComplianceExpired: payload.events.compliance_expired,
      eventComplianceExpiringSoon: payload.events.compliance_expiring_soon,
      providerConfig: {
        integration_active: false,
        whatsapp_provider: null,
        note: 'Provider integration not yet active.',
      },
    },
  });

  return getTenantSettings(tenant, auth, scope, requestId);
}
