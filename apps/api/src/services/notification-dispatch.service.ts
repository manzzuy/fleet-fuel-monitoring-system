import { createHash, randomUUID } from 'node:crypto';

import {
  NotificationChannel,
  NotificationDispatchStatus,
  NotificationEventType,
  Prisma,
  type NotificationOutbox,
  type TenantNotificationSettings,
} from '@prisma/client';

import { env } from '../config/env';
import { prisma } from '../db/prisma';
import { resolveNotificationRecipientsFromDirectory } from './contact-directory.service';
import { logger } from '../utils/logger';

const RETRY_BACKOFF_SECONDS = [60, 5 * 60, 15 * 60, 60 * 60] as const;
const DEFAULT_MAX_ATTEMPTS = 5;
const SUPPORTED_COMPLIANCE_TYPES = new Set(['compliance_expired', 'compliance_expiring_soon']);

type ComplianceAlertType = 'compliance_expired' | 'compliance_expiring_soon';

export interface ComplianceNotificationCandidate {
  alert_type: ComplianceAlertType;
  related_record_id: string;
  occurred_at: string;
  reason: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  action_target?: string;
  site_id?: string | null;
}

type ProviderSendInput = {
  outboxId: string;
  tenantId: string;
  eventType: NotificationEventType;
  recipient: string;
  recipientLabel: string | null;
  idempotencyKey: string;
  payload: Prisma.JsonValue;
};

type ProviderSendResult = {
  status: 'sent' | 'stubbed' | 'failed_retryable' | 'failed_permanent';
  providerName: string;
  responseCode?: number;
  providerMessageId?: string;
  errorCode?: string;
  errorMessage?: string;
};

export interface NotificationProvider {
  readonly name: string;
  send(input: ProviderSendInput): Promise<ProviderSendResult>;
}

export type NotificationProviderReadinessStatus =
  | 'stub_mode'
  | 'provider_not_configured'
  | 'provider_ready_not_enabled'
  | 'ready_for_controlled_send';

class DevStubNotificationProvider implements NotificationProvider {
  readonly name = 'dev_stub';

  async send(input: ProviderSendInput): Promise<ProviderSendResult> {
    logger.info(
      {
        notification_outbox_id: input.outboxId,
        tenant_id: input.tenantId,
        event_type: input.eventType,
        recipient: input.recipient,
        idempotency_key: input.idempotencyKey,
      },
      'notification_stubbed_send',
    );

    return {
      status: 'stubbed',
      providerName: this.name,
      providerMessageId: `stub-${randomUUID()}`,
    };
  }
}

type MetaCloudApiConfig = {
  apiBaseUrl: string;
  apiVersion: string;
  phoneNumberId: string;
  accessToken: string;
};

function envFlag(value: string | undefined, fallback: boolean) {
  if (value === undefined) {
    return fallback;
  }
  return value.toLowerCase() === 'true';
}

function runtimeProviderConfig() {
  const provider = (process.env.NOTIFICATION_PROVIDER ?? env.NOTIFICATION_PROVIDER).toLowerCase();
  const deliveryEnabled = envFlag(
    process.env.NOTIFICATION_DELIVERY_ENABLED,
    env.NOTIFICATION_DELIVERY_ENABLED,
  );
  const allowRealOutsideProduction = envFlag(
    process.env.NOTIFICATION_ALLOW_REAL_SENDS_OUTSIDE_PRODUCTION,
    env.NOTIFICATION_ALLOW_REAL_SENDS_OUTSIDE_PRODUCTION,
  );

  return {
    provider,
    deliveryEnabled,
    allowRealOutsideProduction,
  };
}

class MetaCloudApiNotificationProvider implements NotificationProvider {
  readonly name = 'meta_cloud_api';

  constructor(private readonly config: MetaCloudApiConfig) {}

  private static isLikelyPhoneNumber(recipient: string) {
    return /^\+?[1-9]\d{7,14}$/.test(recipient.trim());
  }

  private static toE164(recipient: string) {
    const trimmed = recipient.trim();
    return trimmed.startsWith('+') ? trimmed : `+${trimmed}`;
  }

  async send(input: ProviderSendInput): Promise<ProviderSendResult> {
    if (!MetaCloudApiNotificationProvider.isLikelyPhoneNumber(input.recipient)) {
      return {
        status: 'failed_permanent',
        providerName: this.name,
        errorCode: 'invalid_recipient_format',
        errorMessage: 'Recipient must be an E.164 phone number for Meta Cloud API delivery.',
      };
    }

    const body = {
      messaging_product: 'whatsapp',
      to: MetaCloudApiNotificationProvider.toE164(input.recipient),
      type: 'text',
      text: {
        body: this.buildMessageBody(input),
      },
    };

    try {
      const response = await fetch(
        `${this.config.apiBaseUrl.replace(/\/+$/, '')}/${this.config.apiVersion}/${this.config.phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${this.config.accessToken}`,
          },
          body: JSON.stringify(body),
        },
      );

      const json = (await response.json().catch(() => null)) as
        | { messages?: Array<{ id?: string }>; error?: { code?: string | number; message?: string } }
        | null;

      if (response.ok) {
        return {
          status: 'sent',
          providerName: this.name,
          responseCode: response.status,
          ...(json?.messages?.[0]?.id ? { providerMessageId: json.messages[0].id } : {}),
        };
      }

      const errorCode = json?.error?.code;
      const errorMessage = json?.error?.message ?? `Meta API rejected request with status ${response.status}.`;
      const retryable = response.status === 429 || response.status >= 500;
      return {
        status: retryable ? 'failed_retryable' : 'failed_permanent',
        providerName: this.name,
        responseCode: response.status,
        errorCode: errorCode ? String(errorCode) : 'meta_send_failed',
        errorMessage,
      };
    } catch (error) {
      return {
        status: 'failed_retryable',
        providerName: this.name,
        errorCode: 'meta_transport_error',
        errorMessage: error instanceof Error ? error.message : 'Meta Cloud API transport failure.',
      };
    }
  }

  private buildMessageBody(input: ProviderSendInput) {
    const payload = input.payload as { reason?: unknown; severity?: unknown; occurred_at?: unknown } | null;
    const reason = typeof payload?.reason === 'string' ? payload.reason : 'Compliance alert requires review.';
    const severity = typeof payload?.severity === 'string' ? payload.severity : 'UNKNOWN';
    const occurredAt = typeof payload?.occurred_at === 'string' ? payload.occurred_at : 'n/a';
    return `Fleet Fuel compliance notification\nSeverity: ${severity}\nOccurred: ${occurredAt}\nReason: ${reason}`;
  }
}

function resolveMetaCloudApiConfig(): MetaCloudApiConfig | null {
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID ?? env.META_WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN ?? env.META_WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    return null;
  }

  return {
    apiBaseUrl: process.env.META_WHATSAPP_API_BASE_URL ?? env.META_WHATSAPP_API_BASE_URL,
    apiVersion: process.env.META_WHATSAPP_API_VERSION ?? env.META_WHATSAPP_API_VERSION,
    phoneNumberId,
    accessToken,
  };
}

function isMetaConfigured() {
  return Boolean(
    (process.env.META_WHATSAPP_PHONE_NUMBER_ID ?? env.META_WHATSAPP_PHONE_NUMBER_ID) &&
      (process.env.META_WHATSAPP_ACCESS_TOKEN ?? env.META_WHATSAPP_ACCESS_TOKEN),
  );
}

function hasRealSendSafetyGuard(config: { allowRealOutsideProduction: boolean }) {
  return env.NODE_ENV === 'production' || config.allowRealOutsideProduction;
}

let providerOverrideFactory: (() => NotificationProvider) | null = null;

function resolveNotificationProvider(): NotificationProvider | null {
  if (providerOverrideFactory) {
    return providerOverrideFactory();
  }

  const config = runtimeProviderConfig();
  const configured = config.provider;
  if (configured === 'stub') {
    return new DevStubNotificationProvider();
  }

  if (!config.deliveryEnabled) {
    return null;
  }

  if (!hasRealSendSafetyGuard(config)) {
    return null;
  }

  if (configured === 'meta_cloud_api') {
    const config = resolveMetaCloudApiConfig();
    if (!config) {
      return null;
    }
    return new MetaCloudApiNotificationProvider(config);
  }

  if (configured === 'twilio_whatsapp') {
    return null;
  }

  return null;
}

function getBackoffDate(attemptCount: number) {
  const seconds = RETRY_BACKOFF_SECONDS[Math.min(attemptCount - 1, RETRY_BACKOFF_SECONDS.length - 1)] ?? 3600;
  return new Date(Date.now() + seconds * 1000);
}

function asEventType(value: ComplianceAlertType): NotificationEventType {
  if (value === 'compliance_expired') {
    return NotificationEventType.COMPLIANCE_EXPIRED;
  }
  return NotificationEventType.COMPLIANCE_EXPIRING_SOON;
}

function eventEnabled(settings: TenantNotificationSettings | null, value: ComplianceAlertType) {
  if (!settings || !settings.notificationsEnabled) {
    return false;
  }

  if (value === 'compliance_expired') {
    return settings.eventComplianceExpired;
  }

  return settings.eventComplianceExpiringSoon;
}

function buildIdempotencyKey(input: {
  tenantId: string;
  eventType: NotificationEventType;
  sourceRecordId: string;
  recipient: string;
  occurredDate: string;
}) {
  const raw = `${input.tenantId}|${input.eventType}|${input.sourceRecordId}|${input.recipient}|${input.occurredDate}`;
  return createHash('sha256').update(raw).digest('hex');
}

export async function enqueueComplianceNotificationCandidates(
  tenantId: string,
  candidates: ComplianceNotificationCandidate[],
): Promise<void> {
  if (candidates.length === 0) {
    return;
  }

  const settings = await prisma.tenantNotificationSettings.findUnique({
    where: {
      tenantId,
    },
  });
  const rows: Prisma.NotificationOutboxCreateManyInput[] = [];

  for (const candidate of candidates) {
    if (!SUPPORTED_COMPLIANCE_TYPES.has(candidate.alert_type)) {
      continue;
    }

    const eventType = asEventType(candidate.alert_type);
    const occurredDate = candidate.occurred_at.slice(0, 10);
    const enabled = eventEnabled(settings, candidate.alert_type);
    const whatsappEnabled = settings?.whatsappEnabled ?? false;
    const status = !enabled
      ? NotificationDispatchStatus.SKIPPED_DISABLED
      : !whatsappEnabled
        ? NotificationDispatchStatus.SKIPPED_NOT_CONFIGURED
        : NotificationDispatchStatus.PENDING;

    const payload: Prisma.InputJsonValue = {
      reason: candidate.reason,
      severity: candidate.severity,
      occurred_at: candidate.occurred_at,
      related_record_id: candidate.related_record_id,
      action_target: candidate.action_target ?? null,
      site_id: candidate.site_id ?? null,
    };

    rows.push({
      tenantId,
      channel: NotificationChannel.WHATSAPP,
      eventType,
      sourceRecordId: candidate.related_record_id,
      idempotencyKey: buildIdempotencyKey({
        tenantId,
        eventType,
        sourceRecordId: candidate.related_record_id,
        recipient: 'directory',
        occurredDate,
      }),
      recipient: null,
      recipientLabel: null,
      payload,
      status,
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
    });
  }

  if (rows.length === 0) {
    return;
  }

  await prisma.notificationOutbox.createMany({
    data: rows,
    skipDuplicates: true,
  });
}

async function writeDeliveryLog(input: {
  outbox: NotificationOutbox;
  providerName: string;
  status: NotificationDispatchStatus;
  attemptNumber: number;
  recipient?: string | null;
  responseCode?: number | null;
  providerMessageId?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}) {
  const data: Prisma.NotificationDeliveryCreateInput = {
    outbox: {
      connect: {
        id: input.outbox.id,
      },
    },
    tenant: {
      connect: {
        id: input.outbox.tenantId,
      },
    },
    providerName: input.providerName,
    recipient: input.recipient ?? input.outbox.recipient,
    status: input.status,
    attemptNumber: input.attemptNumber,
  };

  if (input.responseCode !== undefined) {
    data.responseCode = input.responseCode;
  }
  if (input.providerMessageId !== undefined) {
    data.providerMessageId = input.providerMessageId;
  }
  if (input.errorCode !== undefined) {
    data.errorCode = input.errorCode;
  }
  if (input.errorMessage !== undefined) {
    data.errorMessage = input.errorMessage;
  }

  await prisma.notificationDelivery.create({
    data,
  });
}

async function markOutbox(
  outboxId: string,
  data: Partial<
    Pick<
      NotificationOutbox,
      | 'status'
      | 'attemptCount'
      | 'nextAttemptAt'
      | 'providerName'
      | 'lastErrorCode'
      | 'lastErrorMessage'
      | 'dispatchedAt'
    >
  >,
) {
  await prisma.notificationOutbox.update({
    where: {
      id: outboxId,
    },
    data,
  });
}

export async function dispatchPendingNotifications(input: {
  tenantId?: string;
  limit?: number;
} = {}): Promise<{ processed: number }> {
  const now = new Date();
  const rows = await prisma.notificationOutbox.findMany({
    where: {
      ...(input.tenantId ? { tenantId: input.tenantId } : {}),
      status: {
        in: [NotificationDispatchStatus.PENDING, NotificationDispatchStatus.FAILED_RETRYABLE],
      },
      nextAttemptAt: {
        lte: now,
      },
    },
    orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
    take: input.limit ?? 50,
  });

  if (rows.length === 0) {
    return { processed: 0 };
  }

  for (const row of rows) {
    const attemptNumber = row.attemptCount + 1;

    const settings = await prisma.tenantNotificationSettings.findUnique({
      where: {
        tenantId: row.tenantId,
      },
    });

    if (!settings?.notificationsEnabled) {
      await writeDeliveryLog({
        outbox: row,
        providerName: 'policy_guard',
        status: NotificationDispatchStatus.SKIPPED_DISABLED,
        attemptNumber,
      });
      await markOutbox(row.id, {
        status: NotificationDispatchStatus.SKIPPED_DISABLED,
        attemptCount: attemptNumber,
        providerName: 'policy_guard',
        lastErrorCode: null,
        lastErrorMessage: null,
        dispatchedAt: new Date(),
      });
      continue;
    }

    if (!settings.whatsappEnabled) {
      await writeDeliveryLog({
        outbox: row,
        providerName: 'policy_guard',
        status: NotificationDispatchStatus.SKIPPED_NOT_CONFIGURED,
        attemptNumber,
      });
      await markOutbox(row.id, {
        status: NotificationDispatchStatus.SKIPPED_NOT_CONFIGURED,
        attemptCount: attemptNumber,
        providerName: 'policy_guard',
        lastErrorCode: null,
        lastErrorMessage: 'WhatsApp channel is disabled.',
        dispatchedAt: new Date(),
      });
      continue;
    }

    const provider = resolveNotificationProvider();
    if (!provider) {
      await writeDeliveryLog({
        outbox: row,
        providerName: 'provider_unavailable',
        status: NotificationDispatchStatus.SKIPPED_NOT_CONFIGURED,
        attemptNumber,
        errorCode: 'provider_unavailable',
        errorMessage: 'Notification provider is not configured.',
      });
      await markOutbox(row.id, {
        status: NotificationDispatchStatus.SKIPPED_NOT_CONFIGURED,
        attemptCount: attemptNumber,
        providerName: 'provider_unavailable',
        lastErrorCode: 'provider_unavailable',
        lastErrorMessage: 'Notification provider is not configured.',
        dispatchedAt: new Date(),
      });
      continue;
    }

    const recipients = row.recipient
      ? [{ recipient: row.recipient, label: row.recipientLabel ?? row.recipient }]
      : await resolveNotificationRecipientsFromDirectory({
          tenantId: row.tenantId,
          eventType: row.eventType,
          payload: row.payload,
        });

    if (recipients.length === 0) {
      await writeDeliveryLog({
        outbox: row,
        providerName: 'policy_guard',
        status: NotificationDispatchStatus.SKIPPED_NO_RECIPIENTS,
        attemptNumber,
      });
      await markOutbox(row.id, {
        status: NotificationDispatchStatus.SKIPPED_NO_RECIPIENTS,
        attemptCount: attemptNumber,
        providerName: 'policy_guard',
        lastErrorCode: null,
        lastErrorMessage: 'No recipients resolved for this notification.',
        dispatchedAt: new Date(),
      });
      continue;
    }

    let atLeastOneSent = false;
    let hasRetryableFailure = false;
    let permanentFailureCode: string | null = null;
    let permanentFailureMessage: string | null = null;
    let providerName = provider.name;
    for (const recipient of recipients) {
      const result = await provider.send({
        outboxId: row.id,
        tenantId: row.tenantId,
        eventType: row.eventType,
        recipient: recipient.recipient,
        recipientLabel: recipient.label,
        idempotencyKey: `${row.idempotencyKey}:${recipient.recipient}`,
        payload: row.payload,
      });
      providerName = result.providerName;

      if (result.status === 'sent' || result.status === 'stubbed') {
        const mapped = result.status === 'sent' ? NotificationDispatchStatus.SENT : NotificationDispatchStatus.STUBBED;
        atLeastOneSent = true;
        await writeDeliveryLog({
          outbox: row,
          providerName: result.providerName,
          status: mapped,
          attemptNumber,
          recipient: recipient.recipient,
          ...(result.responseCode !== undefined ? { responseCode: result.responseCode } : {}),
          ...(result.providerMessageId !== undefined ? { providerMessageId: result.providerMessageId } : {}),
        });
        continue;
      }

      if (result.status === 'failed_retryable') {
        hasRetryableFailure = true;
        await writeDeliveryLog({
          outbox: row,
          providerName: result.providerName,
          status: NotificationDispatchStatus.FAILED_RETRYABLE,
          attemptNumber,
          recipient: recipient.recipient,
          ...(result.responseCode !== undefined ? { responseCode: result.responseCode } : {}),
          ...(result.errorCode !== undefined ? { errorCode: result.errorCode } : {}),
          ...(result.errorMessage !== undefined ? { errorMessage: result.errorMessage } : {}),
        });
        continue;
      }

      permanentFailureCode = result.errorCode ?? 'permanent_send_failed';
      permanentFailureMessage = result.errorMessage ?? 'Permanent send failure.';
      await writeDeliveryLog({
        outbox: row,
        providerName: result.providerName,
        status: NotificationDispatchStatus.FAILED_PERMANENT,
        attemptNumber,
        recipient: recipient.recipient,
        ...(result.responseCode !== undefined ? { responseCode: result.responseCode } : {}),
        ...(result.errorCode !== undefined ? { errorCode: result.errorCode } : {}),
        ...(result.errorMessage !== undefined ? { errorMessage: result.errorMessage } : {}),
      });
    }

    if (hasRetryableFailure && !atLeastOneSent) {
      const reachedMax = attemptNumber >= row.maxAttempts;
      const finalStatus = reachedMax
        ? NotificationDispatchStatus.FAILED_PERMANENT
        : NotificationDispatchStatus.FAILED_RETRYABLE;
      await markOutbox(row.id, {
        status: finalStatus,
        attemptCount: attemptNumber,
        nextAttemptAt: reachedMax ? row.nextAttemptAt : getBackoffDate(attemptNumber),
        providerName,
        lastErrorCode: 'retryable_send_failed',
        lastErrorMessage: 'Retryable send failure.',
        dispatchedAt: reachedMax ? new Date() : row.dispatchedAt,
      });
      continue;
    }

    if (atLeastOneSent) {
      const hasOnlyStubbed = providerName === 'dev_stub';
      await markOutbox(row.id, {
        status: hasOnlyStubbed ? NotificationDispatchStatus.STUBBED : NotificationDispatchStatus.SENT,
        attemptCount: attemptNumber,
        providerName,
        lastErrorCode: null,
        lastErrorMessage: null,
        dispatchedAt: new Date(),
      });
      continue;
    }

    await markOutbox(row.id, {
      status: NotificationDispatchStatus.FAILED_PERMANENT,
      attemptCount: attemptNumber,
      providerName,
      lastErrorCode: permanentFailureCode ?? 'permanent_send_failed',
      lastErrorMessage: permanentFailureMessage ?? 'Permanent send failure.',
      dispatchedAt: new Date(),
    });
  }

  return {
    processed: rows.length,
  };
}

export function getNotificationDeliveryMode() {
  const provider = resolveNotificationProvider();
  if (!provider) {
    return 'not_configured' as const;
  }
  if (provider.name === 'dev_stub') {
    return 'stub' as const;
  }
  return 'active' as const;
}

export function getNotificationProviderReadiness(): {
  status: NotificationProviderReadinessStatus;
  provider: string;
  delivery_enabled: boolean;
  configured: boolean;
  real_send_allowed_in_env: boolean;
} {
  const config = runtimeProviderConfig();

  if (config.provider === 'stub') {
    return {
      status: 'stub_mode',
      provider: 'stub',
      delivery_enabled: false,
      configured: true,
      real_send_allowed_in_env: false,
    };
  }

  if (config.provider === 'meta_cloud_api') {
    const configured = isMetaConfigured();
    const realSendGuard = hasRealSendSafetyGuard(config);
    if (!configured) {
      return {
        status: 'provider_not_configured',
        provider: 'meta_cloud_api',
        delivery_enabled: config.deliveryEnabled,
        configured: false,
        real_send_allowed_in_env: realSendGuard,
      };
    }

    if (!config.deliveryEnabled || !realSendGuard) {
      return {
        status: 'provider_ready_not_enabled',
        provider: 'meta_cloud_api',
        delivery_enabled: config.deliveryEnabled,
        configured: true,
        real_send_allowed_in_env: realSendGuard,
      };
    }

    return {
      status: 'ready_for_controlled_send',
      provider: 'meta_cloud_api',
      delivery_enabled: true,
      configured: true,
      real_send_allowed_in_env: true,
    };
  }

  return {
    status: 'provider_not_configured',
    provider: config.provider,
    delivery_enabled: config.deliveryEnabled,
    configured: false,
    real_send_allowed_in_env: hasRealSendSafetyGuard(config),
  };
}

export function __setNotificationProviderFactoryForTests(factory: () => NotificationProvider) {
  providerOverrideFactory = factory;
}

export function __resetNotificationProviderFactoryForTests() {
  providerOverrideFactory = null;
}
