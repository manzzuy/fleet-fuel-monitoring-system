import request from 'supertest';
import { describe, expect, it, afterEach } from 'vitest';

import { NotificationDispatchStatus, PlatformUserRole, UserRole } from '@prisma/client';

import { createApp } from '../src/app';
import { prisma } from '../src/db/prisma';
import {
  __resetNotificationProviderFactoryForTests,
  __setNotificationProviderFactoryForTests,
  dispatchPendingNotifications,
  type NotificationProvider,
} from '../src/services/notification-dispatch.service';
import { signAccessToken } from '../src/utils/jwt';
import { hashPassword } from '../src/utils/password';

describe('Compliance notification outbox pipeline', () => {
  const app = createApp();
  const envSnapshot = {
    provider: process.env.NOTIFICATION_PROVIDER,
    deliveryEnabled: process.env.NOTIFICATION_DELIVERY_ENABLED,
    allowNonProd: process.env.NOTIFICATION_ALLOW_REAL_SENDS_OUTSIDE_PRODUCTION,
    metaPhoneId: process.env.META_WHATSAPP_PHONE_NUMBER_ID,
    metaToken: process.env.META_WHATSAPP_ACCESS_TOKEN,
  };

  function restoreEnvValue(key: string, value: string | undefined) {
    if (value === undefined) {
      delete process.env[key];
      return;
    }
    process.env[key] = value;
  }

  afterEach(() => {
    __resetNotificationProviderFactoryForTests();
    restoreEnvValue('NOTIFICATION_PROVIDER', envSnapshot.provider);
    restoreEnvValue('NOTIFICATION_DELIVERY_ENABLED', envSnapshot.deliveryEnabled);
    restoreEnvValue(
      'NOTIFICATION_ALLOW_REAL_SENDS_OUTSIDE_PRODUCTION',
      envSnapshot.allowNonProd,
    );
    restoreEnvValue('META_WHATSAPP_PHONE_NUMBER_ID', envSnapshot.metaPhoneId);
    restoreEnvValue('META_WHATSAPP_ACCESS_TOKEN', envSnapshot.metaToken);
  });

  async function createPlatformOwner() {
    const email = process.env.PLATFORM_OWNER_EMAIL!;
    const password = process.env.PLATFORM_OWNER_PASSWORD!;

    await prisma.platformUser.upsert({
      where: { email },
      update: {
        role: PlatformUserRole.PLATFORM_OWNER,
        passwordHash: await hashPassword(password),
      },
      create: {
        email,
        role: PlatformUserRole.PLATFORM_OWNER,
        passwordHash: await hashPassword(password),
      },
    });

    const login = await request(app).post('/auth/platform-login').send({ email, password });
    expect(login.status).toBe(200);
    return login.body.access_token as string;
  }

  async function createTenantWithAdmin(
    platformToken: string,
    subdomain: string,
    username: string,
  ): Promise<{ tenantId: string; token: string }> {
    const created = await request(app)
      .post('/platform/tenants')
      .set('authorization', `Bearer ${platformToken}`)
      .send({
        tenantName: `Tenant ${subdomain}`,
        subdomain,
        createInitialAdmin: true,
        initialAdmin: {
          email: `${username}@${subdomain}.test`,
          username,
          password: 'StrongPass123',
          fullName: `${username} Admin`,
        },
      });
    expect(created.status).toBe(201);
    const adminUser = await prisma.user.findFirst({
      where: {
        tenantId: created.body.id as string,
        username,
      },
      select: {
        id: true,
      },
    });
    expect(adminUser).not.toBeNull();
    const token = signAccessToken({
      sub: adminUser!.id,
      tenant_id: created.body.id as string,
      role: UserRole.COMPANY_ADMIN,
      actor_type: 'STAFF',
    });

    return {
      tenantId: created.body.id as string,
      token,
    };
  }

  async function seedExpiringComplianceRecord(input: { tenantId: string; daysUntilExpiry: number }) {
    const site = await prisma.site.create({
      data: {
        tenantId: input.tenantId,
        siteCode: 'NOTIFY-MAIN',
        siteName: 'Notify Main Site',
      },
    });
    const driver = await prisma.user.create({
      data: {
        tenantId: input.tenantId,
        role: UserRole.DRIVER,
        fullName: 'Notify Driver',
        username: `notify-driver-${Math.random().toString(16).slice(2, 7)}`,
        employeeNo: `N-${Math.random().toString(16).slice(2, 8)}`,
        passwordHash: await hashPassword('DriverPass123'),
      },
    });
    await prisma.userSiteAssignment.create({
      data: {
        tenantId: input.tenantId,
        userId: driver.id,
        siteId: site.id,
      },
    });
    const type = await prisma.complianceType.create({
      data: {
        tenantId: input.tenantId,
        name: 'Notification Test Compliance',
        appliesTo: 'DRIVER',
        requiresExpiry: true,
      },
    });

    const expiryDate = new Date();
    expiryDate.setUTCDate(expiryDate.getUTCDate() + input.daysUntilExpiry);

    const record = await prisma.complianceRecord.create({
      data: {
        tenantId: input.tenantId,
        complianceTypeId: type.id,
        appliesTo: 'DRIVER',
        targetUserId: driver.id,
        expiryDate,
      },
    });

    return { record };
  }

  it('creates outbox records and delivery logs for compliance alerts using stub provider', async () => {
    const platformToken = await createPlatformOwner();
    const tenant = await createTenantWithAdmin(platformToken, 'notifystub', 'notifystubadmin');

    await prisma.tenantNotificationSettings.create({
      data: {
        tenantId: tenant.tenantId,
        notificationsEnabled: true,
        whatsappEnabled: true,
        recipientScope: 'CUSTOM',
        customRecipients: [{ label: 'Ops Lead', value: '+96890000000' }],
        eventComplianceExpired: true,
        eventComplianceExpiringSoon: true,
      },
    });
    await seedExpiringComplianceRecord({ tenantId: tenant.tenantId, daysUntilExpiry: -1 });

    const alertsResponse = await request(app)
      .get('/tenanted/dashboard/alerts')
      .set('host', 'notifystub.platform.test')
      .set('authorization', `Bearer ${tenant.token}`);
    expect(alertsResponse.status).toBe(200);

    const outboxRows = await prisma.notificationOutbox.findMany({
      where: {
        tenantId: tenant.tenantId,
      },
    });
    expect(outboxRows.length).toBeGreaterThanOrEqual(1);
    expect(outboxRows.every((row) => row.status === NotificationDispatchStatus.STUBBED)).toBe(true);

    const deliveryRows = await prisma.notificationDelivery.findMany({
      where: {
        tenantId: tenant.tenantId,
      },
    });
    expect(deliveryRows.length).toBeGreaterThanOrEqual(1);
    expect(deliveryRows.every((row) => row.status === NotificationDispatchStatus.STUBBED)).toBe(true);
  });

  it('prevents duplicate sends via deterministic idempotency keys', async () => {
    const platformToken = await createPlatformOwner();
    const tenant = await createTenantWithAdmin(platformToken, 'notifyidem', 'notifyidemadmin');

    await prisma.tenantNotificationSettings.create({
      data: {
        tenantId: tenant.tenantId,
        notificationsEnabled: true,
        whatsappEnabled: true,
        recipientScope: 'CUSTOM',
        customRecipients: [{ label: 'Ops Lead', value: '+96890000001' }],
      },
    });
    const { record } = await seedExpiringComplianceRecord({ tenantId: tenant.tenantId, daysUntilExpiry: -1 });

    for (let i = 0; i < 2; i += 1) {
      const response = await request(app)
        .get('/tenanted/dashboard/alerts')
        .set('host', 'notifyidem.platform.test')
        .set('authorization', `Bearer ${tenant.token}`);
      expect(response.status).toBe(200);
    }

    const outboxRows = await prisma.notificationOutbox.findMany({
      where: {
        tenantId: tenant.tenantId,
        sourceRecordId: record.id,
      },
    });
    expect(outboxRows).toHaveLength(1);

    const deliveries = await prisma.notificationDelivery.findMany({
      where: {
        outboxId: outboxRows[0]!.id,
      },
    });
    expect(deliveries).toHaveLength(1);
  }, 60000);

  it('marks outbox as skipped when notifications are disabled or recipients are missing', async () => {
    const platformToken = await createPlatformOwner();
    const disabledTenant = await createTenantWithAdmin(platformToken, 'notifydisabled', 'notifydisabledadmin');
    const noRecipientTenant = await createTenantWithAdmin(platformToken, 'notifynorec', 'notifynorecadmin');

    await prisma.tenantNotificationSettings.createMany({
      data: [
        {
          tenantId: disabledTenant.tenantId,
          notificationsEnabled: false,
          whatsappEnabled: true,
          recipientScope: 'CUSTOM',
          customRecipients: [{ label: 'Ops Lead', value: '+96890000002' }],
        },
        {
          tenantId: noRecipientTenant.tenantId,
          notificationsEnabled: true,
          whatsappEnabled: true,
          recipientScope: 'CUSTOM',
          customRecipients: [],
        },
      ],
    });

    await seedExpiringComplianceRecord({ tenantId: disabledTenant.tenantId, daysUntilExpiry: -1 });
    await seedExpiringComplianceRecord({ tenantId: noRecipientTenant.tenantId, daysUntilExpiry: -1 });

    const [disabledResponse, noRecipientsResponse] = await Promise.all([
      request(app)
        .get('/tenanted/dashboard/alerts')
        .set('host', 'notifydisabled.platform.test')
        .set('authorization', `Bearer ${disabledTenant.token}`),
      request(app)
        .get('/tenanted/dashboard/alerts')
        .set('host', 'notifynorec.platform.test')
        .set('authorization', `Bearer ${noRecipientTenant.token}`),
    ]);
    expect(disabledResponse.status).toBe(200);
    expect(noRecipientsResponse.status).toBe(200);

    const disabledOutbox = await prisma.notificationOutbox.findFirst({
      where: { tenantId: disabledTenant.tenantId },
      orderBy: { createdAt: 'desc' },
    });
    const noRecipientsOutbox = await prisma.notificationOutbox.findFirst({
      where: { tenantId: noRecipientTenant.tenantId },
      orderBy: { createdAt: 'desc' },
    });

    expect(disabledOutbox?.status).toBe(NotificationDispatchStatus.SKIPPED_DISABLED);
    expect(noRecipientsOutbox?.status).toBe(NotificationDispatchStatus.SKIPPED_NO_RECIPIENTS);
  });

  it('retries retryable provider failures and marks permanent failures safely', async () => {
    const platformToken = await createPlatformOwner();
    const tenant = await createTenantWithAdmin(platformToken, 'notifyretry', 'notifyretryadmin');
    const type = await prisma.complianceType.create({
      data: {
        tenantId: tenant.tenantId,
        name: 'Retry Compliance',
        appliesTo: 'DRIVER',
      },
    });
    const record = await prisma.complianceRecord.create({
      data: {
        tenantId: tenant.tenantId,
        complianceTypeId: type.id,
        appliesTo: 'DRIVER',
      },
    });

    const retryableOutbox = await prisma.notificationOutbox.create({
      data: {
        tenantId: tenant.tenantId,
        channel: 'WHATSAPP',
        eventType: 'COMPLIANCE_EXPIRED',
        sourceRecordId: record.id,
        idempotencyKey: `retryable-${record.id}`,
        recipient: '+96890000003',
        recipientLabel: 'Retryable',
        payload: { reason: 'Retryable test' },
        status: 'PENDING',
      },
    });

    const permanentOutbox = await prisma.notificationOutbox.create({
      data: {
        tenantId: tenant.tenantId,
        channel: 'WHATSAPP',
        eventType: 'COMPLIANCE_EXPIRING_SOON',
        sourceRecordId: record.id,
        idempotencyKey: `permanent-${record.id}`,
        recipient: '+96890000004',
        recipientLabel: 'Permanent',
        payload: { reason: 'Permanent test' },
        status: 'PENDING',
      },
    });

    await prisma.tenantNotificationSettings.create({
      data: {
        tenantId: tenant.tenantId,
        notificationsEnabled: true,
        whatsappEnabled: true,
        recipientScope: 'CUSTOM',
        customRecipients: [{ label: 'Ops', value: '+96890000003' }],
      },
    });

    let callCount = 0;
    const fakeProvider: NotificationProvider = {
      name: 'test_fake_provider',
      async send(input) {
        callCount += 1;
        if (input.outboxId === retryableOutbox.id) {
          return {
            status: 'failed_retryable',
            providerName: 'test_fake_provider',
            responseCode: 503,
            errorCode: 'provider_timeout',
            errorMessage: 'Temporary timeout',
          };
        }
        return {
          status: 'failed_permanent',
          providerName: 'test_fake_provider',
          responseCode: 400,
          errorCode: 'invalid_recipient',
          errorMessage: 'Recipient rejected',
        };
      },
    };

    __setNotificationProviderFactoryForTests(() => fakeProvider);
    const result = await dispatchPendingNotifications({ tenantId: tenant.tenantId, limit: 10 });

    expect(result.processed).toBe(2);
    expect(callCount).toBe(2);

    const refreshedRetryable = await prisma.notificationOutbox.findUniqueOrThrow({
      where: { id: retryableOutbox.id },
    });
    const refreshedPermanent = await prisma.notificationOutbox.findUniqueOrThrow({
      where: { id: permanentOutbox.id },
    });

    expect(refreshedRetryable.status).toBe(NotificationDispatchStatus.FAILED_RETRYABLE);
    expect(refreshedRetryable.attemptCount).toBe(1);
    expect(refreshedRetryable.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());

    expect(refreshedPermanent.status).toBe(NotificationDispatchStatus.FAILED_PERMANENT);
    expect(refreshedPermanent.attemptCount).toBe(1);

    const deliveries = await prisma.notificationDelivery.findMany({
      where: { tenantId: tenant.tenantId },
    });
    expect(deliveries).toHaveLength(2);
  });

  it('keeps notification dispatch tenant-scoped', async () => {
    const platformToken = await createPlatformOwner();
    const tenantA = await createTenantWithAdmin(platformToken, 'notifyisoa', 'notifyisoaadmin');
    const tenantB = await createTenantWithAdmin(platformToken, 'notifyisob', 'notifyisobadmin');

    await prisma.tenantNotificationSettings.createMany({
      data: [
        {
          tenantId: tenantA.tenantId,
          notificationsEnabled: true,
          whatsappEnabled: true,
          recipientScope: 'CUSTOM',
          customRecipients: [{ label: 'A', value: '+96890000011' }],
        },
        {
          tenantId: tenantB.tenantId,
          notificationsEnabled: true,
          whatsappEnabled: true,
          recipientScope: 'CUSTOM',
          customRecipients: [{ label: 'B', value: '+96890000012' }],
        },
      ],
    });

    const [typeA, typeB] = await Promise.all([
      prisma.complianceType.create({
        data: {
          tenantId: tenantA.tenantId,
          name: 'A Type',
          appliesTo: 'DRIVER',
        },
      }),
      prisma.complianceType.create({
        data: {
          tenantId: tenantB.tenantId,
          name: 'B Type',
          appliesTo: 'DRIVER',
        },
      }),
    ]);

    await prisma.notificationOutbox.createMany({
      data: [
        {
          tenantId: tenantA.tenantId,
          channel: 'WHATSAPP',
          eventType: 'COMPLIANCE_EXPIRED',
          sourceRecordId: typeA.id,
          idempotencyKey: `tenant-a-${typeA.id}`,
          recipient: '+96890000011',
          payload: { reason: 'A' },
          status: 'PENDING',
        },
        {
          tenantId: tenantB.tenantId,
          channel: 'WHATSAPP',
          eventType: 'COMPLIANCE_EXPIRED',
          sourceRecordId: typeB.id,
          idempotencyKey: `tenant-b-${typeB.id}`,
          recipient: '+96890000012',
          payload: { reason: 'B' },
          status: 'PENDING',
        },
      ],
    });

    const result = await dispatchPendingNotifications({ tenantId: tenantA.tenantId, limit: 10 });
    expect(result.processed).toBe(1);

    const [outboxA, outboxB] = await Promise.all([
      prisma.notificationOutbox.findFirstOrThrow({ where: { tenantId: tenantA.tenantId } }),
      prisma.notificationOutbox.findFirstOrThrow({ where: { tenantId: tenantB.tenantId } }),
    ]);
    expect(outboxA.status).toBe(NotificationDispatchStatus.STUBBED);
    expect(outboxB.status).toBe(NotificationDispatchStatus.PENDING);
  });

  it('uses stub provider by default when provider mode is not configured', async () => {
    const platformToken = await createPlatformOwner();
    const tenant = await createTenantWithAdmin(platformToken, 'notifystubdefault', 'notifystubdefaultadmin');

    await prisma.tenantNotificationSettings.create({
      data: {
        tenantId: tenant.tenantId,
        notificationsEnabled: true,
        whatsappEnabled: true,
        recipientScope: 'CUSTOM',
        customRecipients: [{ label: 'Ops Lead', value: '+96890000013' }],
      },
    });
    await seedExpiringComplianceRecord({ tenantId: tenant.tenantId, daysUntilExpiry: -1 });

    delete process.env.NOTIFICATION_PROVIDER;
    delete process.env.NOTIFICATION_DELIVERY_ENABLED;

    const response = await request(app)
      .get('/tenanted/dashboard/alerts')
      .set('host', 'notifystubdefault.platform.test')
      .set('authorization', `Bearer ${tenant.token}`);
    expect(response.status).toBe(200);

    const latestOutbox = await prisma.notificationOutbox.findFirst({
      where: { tenantId: tenant.tenantId },
      orderBy: { createdAt: 'desc' },
    });
    expect(latestOutbox?.status).toBe(NotificationDispatchStatus.STUBBED);
    expect(latestOutbox?.providerName).toBe('dev_stub');
  });

  it('keeps meta provider path gated when config is missing or real sends are blocked', async () => {
    const platformToken = await createPlatformOwner();
    const tenant = await createTenantWithAdmin(platformToken, 'notifymetagate', 'notifymetagateadmin');

    await prisma.tenantNotificationSettings.create({
      data: {
        tenantId: tenant.tenantId,
        notificationsEnabled: true,
        whatsappEnabled: true,
        recipientScope: 'CUSTOM',
        customRecipients: [{ label: 'Ops Lead', value: '+96890000014' }],
      },
    });
    await seedExpiringComplianceRecord({ tenantId: tenant.tenantId, daysUntilExpiry: -1 });

    process.env.NOTIFICATION_PROVIDER = 'meta_cloud_api';
    process.env.NOTIFICATION_DELIVERY_ENABLED = 'true';
    process.env.NOTIFICATION_ALLOW_REAL_SENDS_OUTSIDE_PRODUCTION = 'false';
    delete process.env.META_WHATSAPP_PHONE_NUMBER_ID;
    delete process.env.META_WHATSAPP_ACCESS_TOKEN;

    const response = await request(app)
      .get('/tenanted/dashboard/alerts')
      .set('host', 'notifymetagate.platform.test')
      .set('authorization', `Bearer ${tenant.token}`);
    expect(response.status).toBe(200);

    const latestOutbox = await prisma.notificationOutbox.findFirst({
      where: { tenantId: tenant.tenantId },
      orderBy: { createdAt: 'desc' },
    });
    expect(latestOutbox?.status).toBe(NotificationDispatchStatus.SKIPPED_NOT_CONFIGURED);
    expect(latestOutbox?.providerName).toBe('provider_unavailable');
  });
});
