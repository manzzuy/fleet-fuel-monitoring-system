import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { UserRole } from '@prisma/client';

import { createApp } from '../src/app';
import { prisma } from '../src/db/prisma';
import { signAccessToken } from '../src/utils/jwt';

function makeToken(userId: string, tenantId: string, role: UserRole) {
  return signAccessToken({
    sub: userId,
    tenant_id: tenantId,
    role,
    actor_type: 'STAFF',
  });
}

describe('Tenant notification settings', () => {
  const app = createApp();

  async function seedTenant(subdomain: string) {
    const tenant = await prisma.tenant.create({
      data: {
        name: `${subdomain} Tenant`,
        domains: {
          create: {
            subdomain,
            isPrimary: true,
          },
        },
      },
    });

    const [companyAdmin, siteSupervisor] = await Promise.all([
      prisma.user.create({
        data: {
          tenantId: tenant.id,
          role: UserRole.COMPANY_ADMIN,
          username: `${subdomain}_admin`,
          fullName: `${subdomain} Admin`,
          passwordHash: 'hashed',
        },
      }),
      prisma.user.create({
        data: {
          tenantId: tenant.id,
          role: UserRole.SITE_SUPERVISOR,
          username: `${subdomain}_supervisor`,
          fullName: `${subdomain} Supervisor`,
          passwordHash: 'hashed',
        },
      }),
    ]);

    return { tenant, companyAdmin, siteSupervisor };
  }

  it('returns default notification settings when no record exists', async () => {
    const { tenant, companyAdmin } = await seedTenant('notify-default');
    const token = makeToken(companyAdmin.id, tenant.id, UserRole.COMPANY_ADMIN);

    const response = await request(app)
      .get('/tenanted/tenant/settings')
      .set('host', 'notify-default.platform.test')
      .set('authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.notifications).toEqual({
      enabled: false,
      channels: {
        whatsapp: { enabled: false, integration_active: false, delivery_mode: 'stub' },
        email: { enabled: false },
        sms: { enabled: false },
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
    });
  });

  it('persists notification settings through update endpoint', async () => {
    const { tenant, companyAdmin } = await seedTenant('notify-persist');
    const token = makeToken(companyAdmin.id, tenant.id, UserRole.COMPANY_ADMIN);

    const updateResponse = await request(app)
      .put('/tenanted/tenant/settings/notifications')
      .set('host', 'notify-persist.platform.test')
      .set('authorization', `Bearer ${token}`)
      .send({
        enabled: true,
        channels: {
          whatsapp: { enabled: true },
          email: { enabled: false },
          sms: { enabled: false },
        },
        recipient_scope: 'CUSTOM',
        custom_recipients: [
          {
            label: 'Ops Lead',
            value: '+96890000000',
          },
        ],
        events: {
          missing_daily_check: true,
          critical_checklist_issue: true,
          fuel_missing_receipt: true,
          odometer_fallback_used: false,
          approved_source_used: true,
          high_priority_exceptions: true,
          compliance_expired: true,
          compliance_expiring_soon: false,
        },
      });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.notifications.enabled).toBe(true);
    expect(updateResponse.body.notifications.channels.whatsapp.enabled).toBe(true);
    expect(updateResponse.body.notifications.recipient_scope).toBe('CUSTOM');
    expect(updateResponse.body.notifications.custom_recipients).toHaveLength(1);
    expect(updateResponse.body.notifications.events.odometer_fallback_used).toBe(false);
    expect(updateResponse.body.notifications.channels.whatsapp.integration_active).toBe(false);
    expect(updateResponse.body.notifications.events.compliance_expired).toBe(true);
    expect(updateResponse.body.notifications.events.compliance_expiring_soon).toBe(false);

    const persisted = await prisma.tenantNotificationSettings.findUnique({
      where: {
        tenantId: tenant.id,
      },
    });

    expect(persisted).not.toBeNull();
    expect(persisted?.notificationsEnabled).toBe(true);
    expect(persisted?.whatsappEnabled).toBe(true);
    expect(persisted?.recipientScope).toBe('CUSTOM');
  });

  it('enforces tenant scoping and prevents cross-tenant updates', async () => {
    const tenantA = await seedTenant('notify-tenant-a');
    const tenantB = await seedTenant('notify-tenant-b');
    const tokenA = makeToken(tenantA.companyAdmin.id, tenantA.tenant.id, UserRole.COMPANY_ADMIN);

    const response = await request(app)
      .put('/tenanted/tenant/settings/notifications')
      .set('host', 'notify-tenant-b.platform.test')
      .set('authorization', `Bearer ${tokenA}`)
      .send({
        enabled: true,
        channels: {
          whatsapp: { enabled: true },
          email: { enabled: false },
          sms: { enabled: false },
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
      });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('tenant_mismatch');
  });

  it('rejects SITE_SUPERVISOR update attempts', async () => {
    const { tenant, siteSupervisor } = await seedTenant('notify-sup');
    const token = makeToken(siteSupervisor.id, tenant.id, UserRole.SITE_SUPERVISOR);

    const response = await request(app)
      .put('/tenanted/tenant/settings/notifications')
      .set('host', 'notify-sup.platform.test')
      .set('authorization', `Bearer ${token}`)
      .send({
        enabled: true,
        channels: {
          whatsapp: { enabled: true },
          email: { enabled: false },
          sms: { enabled: false },
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
      });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('forbidden_settings_update');
  });

  it('returns recipient preview with directory source and provider readiness', async () => {
    const { tenant, companyAdmin } = await seedTenant('notify-preview');
    const token = makeToken(companyAdmin.id, tenant.id, UserRole.COMPANY_ADMIN);

    const site = await prisma.site.create({
      data: {
        tenantId: tenant.id,
        siteCode: 'PRV-001',
        siteName: 'Preview Site',
      },
    });

    await prisma.contactDirectoryEntry.create({
      data: {
        tenantId: tenant.id,
        name: 'Preview Supervisor',
        role: 'SITE_SUPERVISOR',
        phoneE164: '+96891111111',
        isActive: true,
        siteAssignments: {
          create: {
            tenantId: tenant.id,
            siteId: site.id,
          },
        },
      },
    });

    const response = await request(app)
      .get('/tenanted/tenant/settings/notifications/preview')
      .set('host', 'notify-preview.platform.test')
      .set('authorization', `Bearer ${token}`)
      .query({
        event_type: 'COMPLIANCE_EXPIRING_SOON',
        site_id: site.id,
      });

    expect(response.status).toBe(200);
    expect(response.body.resolution.source).toBe('contact_directory');
    expect(response.body.provider_readiness.status).toBe('stub_mode');
    expect(response.body.resolved_recipients.some((item: { recipient: string }) => item.recipient === '+96891111111')).toBe(
      true,
    );
  });

  it('keeps recipient preview tenant-scoped and rejects cross-tenant host/token mismatch', async () => {
    const tenantA = await seedTenant('notify-preview-a');
    const tenantB = await seedTenant('notify-preview-b');
    const tokenA = makeToken(tenantA.companyAdmin.id, tenantA.tenant.id, UserRole.COMPANY_ADMIN);

    const response = await request(app)
      .get('/tenanted/tenant/settings/notifications/preview')
      .set('host', 'notify-preview-b.platform.test')
      .set('authorization', `Bearer ${tokenA}`)
      .query({
        event_type: 'COMPLIANCE_EXPIRED',
      });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('tenant_mismatch');
  });

  it('rejects SITE_SUPERVISOR preview access and returns no-fallback when unresolved', async () => {
    const { tenant, siteSupervisor, companyAdmin } = await seedTenant('notify-preview-sup');
    const supToken = makeToken(siteSupervisor.id, tenant.id, UserRole.SITE_SUPERVISOR);

    const denied = await request(app)
      .get('/tenanted/tenant/settings/notifications/preview')
      .set('host', 'notify-preview-sup.platform.test')
      .set('authorization', `Bearer ${supToken}`)
      .query({
        event_type: 'COMPLIANCE_EXPIRED',
      });

    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('forbidden_settings_read');

    const adminToken = makeToken(companyAdmin.id, tenant.id, UserRole.COMPANY_ADMIN);
    const unresolved = await request(app)
      .get('/tenanted/tenant/settings/notifications/preview')
      .set('host', 'notify-preview-sup.platform.test')
      .set('authorization', `Bearer ${adminToken}`)
      .query({
        event_type: 'COMPLIANCE_EXPIRED',
      });

    expect(unresolved.status).toBe(200);
    expect(unresolved.body.resolution.source).toBe('none');
    expect(unresolved.body.resolved_recipients).toHaveLength(0);
  });

  it('returns provider readiness status for configured-but-disabled meta mode', async () => {
    const previous = {
      provider: process.env.NOTIFICATION_PROVIDER,
      enabled: process.env.NOTIFICATION_DELIVERY_ENABLED,
      phoneId: process.env.META_WHATSAPP_PHONE_NUMBER_ID,
      token: process.env.META_WHATSAPP_ACCESS_TOKEN,
    };

    process.env.NOTIFICATION_PROVIDER = 'meta_cloud_api';
    process.env.NOTIFICATION_DELIVERY_ENABLED = 'false';
    process.env.META_WHATSAPP_PHONE_NUMBER_ID = '1234567890';
    process.env.META_WHATSAPP_ACCESS_TOKEN = 'token-value';

    try {
      const { tenant, companyAdmin } = await seedTenant('notify-preview-ready');
      const token = makeToken(companyAdmin.id, tenant.id, UserRole.COMPANY_ADMIN);
      const response = await request(app)
        .get('/tenanted/tenant/settings/notifications/preview')
        .set('host', 'notify-preview-ready.platform.test')
        .set('authorization', `Bearer ${token}`)
        .query({
          event_type: 'COMPLIANCE_EXPIRED',
        });

      expect(response.status).toBe(200);
      expect(response.body.provider_readiness.status).toBe('provider_ready_not_enabled');
      expect(response.body.provider_readiness.provider).toBe('meta_cloud_api');
    } finally {
      process.env.NOTIFICATION_PROVIDER = previous.provider;
      process.env.NOTIFICATION_DELIVERY_ENABLED = previous.enabled;
      process.env.META_WHATSAPP_PHONE_NUMBER_ID = previous.phoneId;
      process.env.META_WHATSAPP_ACCESS_TOKEN = previous.token;
    }
  });
});
