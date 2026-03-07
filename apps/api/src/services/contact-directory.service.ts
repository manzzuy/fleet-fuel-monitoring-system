import { ContactDirectoryRole, NotificationEventType, type NotificationRecipientScope } from '@prisma/client';

import { prisma } from '../db/prisma';
import type { AuthContext, DataScopeContext } from '../types/http';
import { AppError } from '../utils/errors';
import { normalizePhoneToE164 } from '../utils/phone';

type ContactPayload = {
  user_id?: string | null | undefined;
  name: string;
  role: ContactDirectoryRole;
  phone: string | null | undefined;
  email: string | null | undefined;
  is_active: boolean;
};

type NotificationAudience = 'SUPPORTIVE_DRIVER_ALLOWED' | 'SUPERVISOR_ONLY_REVIEW';

export type ResolvedDirectoryRecipient = {
  recipient: string;
  label: string;
};

export type NotificationRecipientPreviewItem = {
  recipient: string;
  label: string;
  source: 'contact_directory' | 'legacy_settings';
  normalized_contact: string;
  contact_id: string | null;
  contact_role: ContactDirectoryRole | null;
  scope: 'TENANT_WIDE' | 'SITE_SCOPED';
  site_ids: string[];
};

function canManageContacts(role: AuthContext['role']) {
  return ['COMPANY_ADMIN', 'SUPERVISOR', 'TRANSPORT_MANAGER', 'HEAD_OFFICE_ADMIN'].includes(role);
}

export function ensureCanManageContacts(auth: AuthContext, scope: DataScopeContext) {
  if (!canManageContacts(auth.role)) {
    throw new AppError(403, 'forbidden_contact_management', 'Your role cannot manage notification contacts.');
  }

  if (!scope.isFullTenantScope) {
    throw new AppError(
      403,
      'forbidden_contact_management',
      'Site-scoped users cannot manage tenant notification contacts.',
    );
  }
}

async function ensureTenantUser(tenantId: string, userId: string) {
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      tenantId,
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      username: true,
      role: true,
    },
  });

  if (!user) {
    throw new AppError(404, 'user_not_found', 'Linked user was not found for this tenant.');
  }
  return user;
}

function asRole(role: string | null | undefined) {
  if (
    role === ContactDirectoryRole.SITE_SUPERVISOR ||
    role === ContactDirectoryRole.TRANSPORT_MANAGER ||
    role === ContactDirectoryRole.HEAD_OFFICE_ADMIN ||
    role === ContactDirectoryRole.CUSTOM
  ) {
    return role;
  }
  return null;
}

export async function listContacts(tenantId: string) {
  const entries = await prisma.contactDirectoryEntry.findMany({
    where: {
      tenantId,
    },
    include: {
      siteAssignments: {
        include: {
          site: {
            select: {
              id: true,
              siteCode: true,
              siteName: true,
            },
          },
        },
      },
    },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  });

  return entries.map((entry) => ({
    id: entry.id,
    user_id: entry.userId,
    name: entry.name,
    role: entry.role,
    phone_e164: entry.phoneE164,
    email: entry.email,
    is_active: entry.isActive,
    sites: entry.siteAssignments.map((item) => ({
      id: item.site.id,
      site_code: item.site.siteCode,
      site_name: item.site.siteName,
    })),
    created_at: entry.createdAt.toISOString(),
    updated_at: entry.updatedAt.toISOString(),
  }));
}

export async function createContact(tenantId: string, payload: ContactPayload) {
  let role = payload.role;
  let normalizedPhone = payload.phone ? normalizePhoneToE164(payload.phone) : null;
  let name = payload.name.trim();
  let email = payload.email?.trim() || null;

  if (!normalizedPhone && !email) {
    throw new AppError(400, 'contact_channel_required', 'Contact must include at least one channel: phone or email.');
  }

  let userId: string | null = payload.user_id ?? null;
  if (userId) {
    const user = await ensureTenantUser(tenantId, userId);
    name = name || user.fullName;
    email = email ?? user.email ?? null;
    role = asRole(user.role) ?? role;
  }

  if (!name) {
    throw new AppError(400, 'contact_name_required', 'Contact name is required.');
  }

  const created = await prisma.contactDirectoryEntry.create({
    data: {
      tenantId,
      userId,
      name,
      role,
      phoneE164: normalizedPhone,
      email,
      isActive: payload.is_active,
    },
  });

  return {
    id: created.id,
    user_id: created.userId,
    name: created.name,
    role: created.role,
    phone_e164: created.phoneE164,
    email: created.email,
    is_active: created.isActive,
    created_at: created.createdAt.toISOString(),
    updated_at: created.updatedAt.toISOString(),
  };
}

export async function updateContact(
  tenantId: string,
  contactId: string,
  payload: {
    user_id?: string | null | undefined;
    name?: string | undefined;
    role?: ContactDirectoryRole | undefined;
    phone?: string | null | undefined;
    email?: string | null | undefined;
    is_active?: boolean | undefined;
  },
) {
  const existing = await prisma.contactDirectoryEntry.findFirst({
    where: {
      id: contactId,
      tenantId,
    },
  });
  if (!existing) {
    throw new AppError(404, 'contact_not_found', 'Notification contact was not found.');
  }

  const nextPhone = payload.phone === undefined ? existing.phoneE164 : payload.phone ? normalizePhoneToE164(payload.phone) : null;
  const nextEmail = payload.email === undefined ? existing.email : payload.email?.trim() || null;
  const nextName = payload.name === undefined ? existing.name : payload.name.trim();

  if (!nextPhone && !nextEmail) {
    throw new AppError(400, 'contact_channel_required', 'Contact must include at least one channel: phone or email.');
  }

  const updated = await prisma.contactDirectoryEntry.update({
    where: {
      id: existing.id,
    },
    data: {
      name: nextName,
      role: payload.role ?? existing.role,
      phoneE164: nextPhone,
      email: nextEmail,
      isActive: payload.is_active ?? existing.isActive,
      userId: payload.user_id === undefined ? existing.userId : payload.user_id,
    },
  });

  return {
    id: updated.id,
    user_id: updated.userId,
    name: updated.name,
    role: updated.role,
    phone_e164: updated.phoneE164,
    email: updated.email,
    is_active: updated.isActive,
    created_at: updated.createdAt.toISOString(),
    updated_at: updated.updatedAt.toISOString(),
  };
}

export async function assignContactToSite(tenantId: string, contactId: string, siteId: string) {
  const [contact, site] = await Promise.all([
    prisma.contactDirectoryEntry.findFirst({
      where: {
        id: contactId,
        tenantId,
      },
      select: { id: true },
    }),
    prisma.site.findFirst({
      where: {
        id: siteId,
        tenantId,
      },
      select: { id: true },
    }),
  ]);

  if (!contact) {
    throw new AppError(404, 'contact_not_found', 'Notification contact was not found.');
  }
  if (!site) {
    throw new AppError(404, 'site_not_found', 'Site was not found for this tenant.');
  }

  await prisma.contactSiteAssignment.upsert({
    where: {
      tenantId_contactId_siteId: {
        tenantId,
        contactId,
        siteId,
      },
    },
    update: {},
    create: {
      tenantId,
      contactId,
      siteId,
    },
  });
}

export async function removeContactSiteAssignment(tenantId: string, contactId: string, siteId: string) {
  await prisma.contactSiteAssignment.deleteMany({
    where: {
      tenantId,
      contactId,
      siteId,
    },
  });
}

function audienceForEvent(eventType: NotificationEventType): NotificationAudience {
  if (
    eventType === NotificationEventType.COMPLIANCE_EXPIRED ||
    eventType === NotificationEventType.COMPLIANCE_EXPIRING_SOON
  ) {
    // Staged rollout: driver-facing notifications are limited to supportive task/compliance events.
    return 'SUPPORTIVE_DRIVER_ALLOWED';
  }

  // Fail-safe default: any future review/investigation events are supervisor-only until explicitly approved.
  return 'SUPERVISOR_ONLY_REVIEW';
}

function mapOutboxEventToContactRoles(eventType: NotificationEventType): ContactDirectoryRole[] {
  const audience = audienceForEvent(eventType);
  if (audience === 'SUPPORTIVE_DRIVER_ALLOWED') {
    return [
      ContactDirectoryRole.SITE_SUPERVISOR,
      ContactDirectoryRole.TRANSPORT_MANAGER,
      ContactDirectoryRole.HEAD_OFFICE_ADMIN,
      ContactDirectoryRole.CUSTOM,
    ];
  }

  return [
    ContactDirectoryRole.SITE_SUPERVISOR,
    ContactDirectoryRole.TRANSPORT_MANAGER,
    ContactDirectoryRole.HEAD_OFFICE_ADMIN,
  ];
}

function parseSiteIdFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const value = (payload as { site_id?: unknown }).site_id;
  return typeof value === 'string' ? value : null;
}

function normalizeLegacyRecipient(value: string): string {
  if (value.startsWith('user:')) {
    return value;
  }
  if (value.includes('@')) {
    return value.trim().toLowerCase();
  }
  return normalizePhoneToE164(value);
}

async function resolveLegacyRecipients(
  tenantId: string,
  audience: NotificationAudience,
  recipientScope: NotificationRecipientScope,
  customRecipients: unknown,
) {
  if (recipientScope === 'CUSTOM') {
    if (audience !== 'SUPPORTIVE_DRIVER_ALLOWED') {
      return [];
    }
    const values = Array.isArray(customRecipients) ? customRecipients : [];
    return values
      .map((entry) => {
        const row = entry as { label?: unknown; value?: unknown };
        if (typeof row.value !== 'string' || typeof row.label !== 'string') {
          return null;
        }
        return {
          recipient: normalizeLegacyRecipient(row.value),
          label: row.label.trim(),
        };
      })
      .filter((entry): entry is ResolvedDirectoryRecipient => Boolean(entry));
  }

  const roles =
    recipientScope === 'SITE_SUPERVISORS_ONLY'
      ? ['SITE_SUPERVISOR']
      : audience === 'SUPPORTIVE_DRIVER_ALLOWED'
        ? ['COMPANY_ADMIN', 'SUPERVISOR', 'SITE_SUPERVISOR', 'TRANSPORT_MANAGER', 'HEAD_OFFICE_ADMIN', 'DRIVER']
        : ['COMPANY_ADMIN', 'SUPERVISOR', 'SITE_SUPERVISOR', 'TRANSPORT_MANAGER', 'HEAD_OFFICE_ADMIN'];

  const users = await prisma.user.findMany({
    where: {
      tenantId,
      isActive: true,
      role: {
        in: roles as never[],
      },
    },
    select: {
      id: true,
      fullName: true,
      username: true,
      email: true,
    },
  });

  return users.map((user) => ({
    recipient: `user:${user.id}`,
    label: user.fullName || user.username || user.email || user.id,
  }));
}

async function resolveDirectoryRecipientsPreview(input: {
  tenantId: string;
  eventType: NotificationEventType;
  payload: unknown;
}) {
  const audience = audienceForEvent(input.eventType);
  const siteId = parseSiteIdFromPayload(input.payload);
  const roles = mapOutboxEventToContactRoles(input.eventType);
  const where = siteId
    ? {
        tenantId: input.tenantId,
        isActive: true,
        role: {
          in: roles,
        },
        OR: [
          { siteAssignments: { some: { tenantId: input.tenantId, siteId } } },
          { siteAssignments: { none: {} } },
        ],
      }
    : {
        tenantId: input.tenantId,
        isActive: true,
        role: {
          in: roles,
        },
      };

  const contacts = await prisma.contactDirectoryEntry.findMany({
    where,
    include: {
      user: {
        select: {
          role: true,
        },
      },
      siteAssignments: {
        where: {
          tenantId: input.tenantId,
        },
        select: {
          siteId: true,
        },
      },
    },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
  });

  const byRecipient = new Map<string, NotificationRecipientPreviewItem>();
  for (const contact of contacts) {
    if (siteId && contact.role === ContactDirectoryRole.SITE_SUPERVISOR) {
      const hasSite = contact.siteAssignments.some((assignment) => assignment.siteId === siteId);
      if (!hasSite) {
        continue;
      }
    }

    if (contact.user?.role === 'DRIVER' && audience !== 'SUPPORTIVE_DRIVER_ALLOWED') {
      continue;
    }

    const destination = contact.phoneE164 ?? contact.email;
    if (!destination) {
      continue;
    }

    if (!byRecipient.has(destination)) {
      const siteIds = contact.siteAssignments.map((assignment) => assignment.siteId);
      byRecipient.set(destination, {
        recipient: destination,
        label: contact.name,
        source: 'contact_directory',
        normalized_contact: destination,
        contact_id: contact.id,
        contact_role: contact.role,
        scope: siteIds.length > 0 ? 'SITE_SCOPED' : 'TENANT_WIDE',
        site_ids: siteIds,
      });
    }
  }

  return {
    audience,
    siteId,
    items: Array.from(byRecipient.values()),
  };
}

export async function resolveNotificationRecipientsFromDirectory(input: {
  tenantId: string;
  eventType: NotificationEventType;
  payload: unknown;
}): Promise<ResolvedDirectoryRecipient[]> {
  const preview = await resolveDirectoryRecipientsPreview(input);
  const byRecipient = new Map<string, ResolvedDirectoryRecipient>(
    preview.items.map((item) => [
      item.recipient,
      {
        recipient: item.recipient,
        label: item.label,
      },
    ]),
  );

  if (byRecipient.size > 0) {
    return Array.from(byRecipient.values());
  }

  const settings = await prisma.tenantNotificationSettings.findUnique({
    where: { tenantId: input.tenantId },
    select: {
      recipientScope: true,
      customRecipients: true,
    },
  });

  if (!settings) {
    return [];
  }

  return resolveLegacyRecipients(input.tenantId, preview.audience, settings.recipientScope, settings.customRecipients);
}

export async function previewNotificationRecipientResolution(input: {
  tenantId: string;
  eventType: NotificationEventType;
  siteId: string | null;
}): Promise<{
  event_type: NotificationEventType;
  scope: 'TENANT' | 'SITE';
  site_id: string | null;
  resolved_recipients: NotificationRecipientPreviewItem[];
  resolution_source: 'contact_directory' | 'legacy_settings' | 'none';
  fallback_used: boolean;
}> {
  const preview = await resolveDirectoryRecipientsPreview({
    tenantId: input.tenantId,
    eventType: input.eventType,
    payload: { site_id: input.siteId },
  });

  if (preview.items.length > 0) {
    return {
      event_type: input.eventType,
      scope: input.siteId ? 'SITE' : 'TENANT',
      site_id: input.siteId,
      resolved_recipients: preview.items,
      resolution_source: 'contact_directory',
      fallback_used: false,
    };
  }

  const settings = await prisma.tenantNotificationSettings.findUnique({
    where: { tenantId: input.tenantId },
    select: {
      recipientScope: true,
      customRecipients: true,
    },
  });

  if (!settings) {
    return {
      event_type: input.eventType,
      scope: input.siteId ? 'SITE' : 'TENANT',
      site_id: input.siteId,
      resolved_recipients: [],
      resolution_source: 'none',
      fallback_used: false,
    };
  }

  const fallback = await resolveLegacyRecipients(
    input.tenantId,
    preview.audience,
    settings.recipientScope,
    settings.customRecipients,
  );

  if (fallback.length === 0) {
    return {
      event_type: input.eventType,
      scope: input.siteId ? 'SITE' : 'TENANT',
      site_id: input.siteId,
      resolved_recipients: [],
      resolution_source: 'none',
      fallback_used: false,
    };
  }

  return {
    event_type: input.eventType,
    scope: input.siteId ? 'SITE' : 'TENANT',
    site_id: input.siteId,
    resolved_recipients: fallback.map((entry) => ({
      recipient: entry.recipient,
      label: entry.label,
      source: 'legacy_settings',
      normalized_contact: entry.recipient,
      contact_id: null,
      contact_role: null,
      scope: 'TENANT_WIDE',
      site_ids: [],
    })),
    resolution_source: 'legacy_settings',
    fallback_used: true,
  };
}
