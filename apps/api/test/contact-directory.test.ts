import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { PlatformUserRole, UserRole } from '@prisma/client';

import { createApp } from '../src/app';
import { prisma } from '../src/db/prisma';
import { signAccessToken } from '../src/utils/jwt';
import { hashPassword } from '../src/utils/password';
import { normalizePhoneToE164 } from '../src/utils/phone';
import { resolveNotificationRecipientsFromDirectory } from '../src/services/contact-directory.service';

describe('Notification contact directory', () => {
  const app = createApp();

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
  ): Promise<{ tenantId: string; token: string; adminId: string }> {
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

    const adminUser = await prisma.user.findFirstOrThrow({
      where: {
        tenantId: created.body.id as string,
        username,
      },
      select: { id: true },
    });

    const token = signAccessToken({
      sub: adminUser.id,
      tenant_id: created.body.id as string,
      role: UserRole.COMPANY_ADMIN,
      actor_type: 'STAFF',
    });

    return {
      tenantId: created.body.id as string,
      token,
      adminId: adminUser.id,
    };
  }

  it('normalizes phone numbers to E.164 and rejects invalid values', () => {
    expect(normalizePhoneToE164('9000 0000')).toBe('+96890000000');
    expect(normalizePhoneToE164('+968-9000-0001')).toBe('+96890000001');
    expect(() => normalizePhoneToE164('abc')).toThrowError(/E.164/i);
  });

  it('creates contacts with normalized phones and enforces tenant isolation', async () => {
    const platformToken = await createPlatformOwner();
    const tenantA = await createTenantWithAdmin(platformToken, 'contacta', 'contactaadmin');
    const tenantB = await createTenantWithAdmin(platformToken, 'contactb', 'contactbadmin');

    const created = await request(app)
      .post('/tenanted/notification-contacts')
      .set('host', 'contacta.platform.test')
      .set('authorization', `Bearer ${tenantA.token}`)
      .send({
        name: 'Ops A',
        role: 'CUSTOM',
        phone: '9000 0002',
        email: null,
      });
    expect(created.status).toBe(201);
    expect(created.body.item.phone_e164).toBe('+96890000002');

    const listedA = await request(app)
      .get('/tenanted/notification-contacts')
      .set('host', 'contacta.platform.test')
      .set('authorization', `Bearer ${tenantA.token}`);
    expect(listedA.status).toBe(200);
    expect(listedA.body.items).toHaveLength(1);

    const listedB = await request(app)
      .get('/tenanted/notification-contacts')
      .set('host', 'contactb.platform.test')
      .set('authorization', `Bearer ${tenantB.token}`);
    expect(listedB.status).toBe(200);
    expect(listedB.body.items).toHaveLength(0);
  });

  it('assigns contacts to sites and resolves notification recipients through directory', async () => {
    const platformToken = await createPlatformOwner();
    const tenant = await createTenantWithAdmin(platformToken, 'contactresolve', 'contactresolveadmin');

    const site = await prisma.site.create({
      data: {
        tenantId: tenant.tenantId,
        siteCode: 'DIR-001',
        siteName: 'Directory Site',
      },
    });
    const driver = await prisma.user.create({
      data: {
        tenantId: tenant.tenantId,
        role: UserRole.DRIVER,
        fullName: 'Driver For Contact',
        username: `driver-${Math.random().toString(16).slice(2, 8)}`,
        employeeNo: `EMP-${Math.random().toString(16).slice(2, 8)}`,
        passwordHash: await hashPassword('DriverPass123'),
      },
    });
    await prisma.userSiteAssignment.create({
      data: {
        tenantId: tenant.tenantId,
        userId: driver.id,
        siteId: site.id,
      },
    });

    const contactResponse = await request(app)
      .post('/tenanted/notification-contacts')
      .set('host', 'contactresolve.platform.test')
      .set('authorization', `Bearer ${tenant.token}`)
      .send({
        name: 'Site Supervisor Contact',
        role: 'SITE_SUPERVISOR',
        phone: '+96890000003',
      });
    expect(contactResponse.status).toBe(201);
    const contactId = contactResponse.body.item.id as string;

    const assigned = await request(app)
      .post(`/tenanted/notification-contacts/${contactId}/sites`)
      .set('host', 'contactresolve.platform.test')
      .set('authorization', `Bearer ${tenant.token}`)
      .send({ site_id: site.id });
    expect(assigned.status).toBe(200);

    await prisma.tenantNotificationSettings.create({
      data: {
        tenantId: tenant.tenantId,
        notificationsEnabled: true,
        whatsappEnabled: true,
        recipientScope: 'ALL_TENANT_OPERATIONS',
      },
    });

    const type = await prisma.complianceType.create({
      data: {
        tenantId: tenant.tenantId,
        name: 'Contact Compliance',
        appliesTo: 'DRIVER',
        requiresExpiry: true,
      },
    });

    await prisma.complianceRecord.create({
      data: {
        tenantId: tenant.tenantId,
        complianceTypeId: type.id,
        appliesTo: 'DRIVER',
        targetUserId: driver.id,
        expiryDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
        createdBy: tenant.adminId,
      },
    });

    const alertsResponse = await request(app)
      .get('/tenanted/dashboard/alerts')
      .set('host', 'contactresolve.platform.test')
      .set('authorization', `Bearer ${tenant.token}`);
    expect(alertsResponse.status).toBe(200);

    const outbox = await prisma.notificationOutbox.findFirst({
      where: {
        tenantId: tenant.tenantId,
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(outbox).not.toBeNull();
    expect(outbox?.status).toBe('STUBBED');

    const deliveries = await prisma.notificationDelivery.findMany({
      where: {
        tenantId: tenant.tenantId,
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(deliveries.length).toBeGreaterThan(0);
    expect(deliveries[0]?.recipient).toBe('+96890000003');
  });

  it('allows driver-linked recipients only for supportive events and defaults unknown events to supervisor-only', async () => {
    const platformToken = await createPlatformOwner();
    const tenant = await createTenantWithAdmin(platformToken, 'contactaudience', 'contactaudienceadmin');

    const driver = await prisma.user.create({
      data: {
        tenantId: tenant.tenantId,
        role: UserRole.DRIVER,
        fullName: 'Driver Audience User',
        username: `driver-aud-${Math.random().toString(16).slice(2, 8)}`,
        employeeNo: `EMP-AUD-${Math.random().toString(16).slice(2, 8)}`,
        passwordHash: await hashPassword('DriverPass123'),
      },
    });

    await prisma.contactDirectoryEntry.create({
      data: {
        tenantId: tenant.tenantId,
        userId: driver.id,
        name: 'Driver Contact',
        role: 'CUSTOM',
        phoneE164: '+96890000044',
        isActive: true,
      },
    });

    const supportiveRecipients = await resolveNotificationRecipientsFromDirectory({
      tenantId: tenant.tenantId,
      eventType: 'COMPLIANCE_EXPIRED',
      payload: {},
    });
    expect(supportiveRecipients.some((item) => item.recipient === '+96890000044')).toBe(true);

    const reviewRecipients = await resolveNotificationRecipientsFromDirectory({
      tenantId: tenant.tenantId,
      eventType: 'FUEL_ANOMALY_REVIEW' as unknown as Parameters<
        typeof resolveNotificationRecipientsFromDirectory
      >[0]['eventType'],
      payload: {},
    });
    expect(reviewRecipients.some((item) => item.recipient === '+96890000044')).toBe(false);
  });
});
