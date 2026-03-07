import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { PlatformUserRole, UserRole } from '@prisma/client';

import { createApp } from '../src/app';
import { prisma } from '../src/db/prisma';
import { hashPassword } from '../src/utils/password';

describe('Compliance model and expiry tracking', () => {
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

    const login = await request(app)
      .post('/auth/login')
      .set('host', `${subdomain}.platform.test`)
      .send({
        identifier: username,
        password: 'StrongPass123',
      });
    expect(login.status).toBe(200);

    return {
      tenantId: created.body.id as string,
      token: login.body.access_token as string,
    };
  }

  it('creates compliance types and assigns records to drivers and vehicles', async () => {
    const platformToken = await createPlatformOwner();
    const tenant = await createTenantWithAdmin(platformToken, 'compliancea', 'complianceaadmin');

    const site = await prisma.site.create({
      data: {
        tenantId: tenant.tenantId,
        siteCode: 'MAIN',
        siteName: 'Main Site',
      },
    });
    const [vehicle, driver] = await Promise.all([
      prisma.vehicle.create({
        data: {
          tenantId: tenant.tenantId,
          fleetNumber: 'CMP-001',
          plateNumber: 'CMP-001',
          siteId: site.id,
        },
      }),
      prisma.user.create({
        data: {
          tenantId: tenant.tenantId,
          role: UserRole.DRIVER,
          fullName: 'Driver One',
          username: 'driverone',
          employeeNo: 'EMP-001',
          passwordHash: await hashPassword('DriverPass123'),
        },
      }),
    ]);

    const createdDriverType = await request(app)
      .post('/tenanted/compliance/types')
      .set('host', 'compliancea.platform.test')
      .set('authorization', `Bearer ${tenant.token}`)
      .send({
        name: 'H2S',
        applies_to: 'DRIVER',
        requires_expiry: true,
      });
    expect(createdDriverType.status).toBe(201);

    const createdVehicleType = await request(app)
      .post('/tenanted/compliance/types')
      .set('host', 'compliancea.platform.test')
      .set('authorization', `Bearer ${tenant.token}`)
      .send({
        name: 'Registration',
        applies_to: 'VEHICLE',
        requires_expiry: true,
      });
    expect(createdVehicleType.status).toBe(201);

    const driverRecord = await request(app)
      .post('/tenanted/compliance/records')
      .set('host', 'compliancea.platform.test')
      .set('authorization', `Bearer ${tenant.token}`)
      .send({
        applies_to: 'DRIVER',
        target_id: driver.id,
        compliance_type_id: createdDriverType.body.item.id,
        reference_number: 'H2S-100',
        expiry_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      });
    expect(driverRecord.status).toBe(201);

    const vehicleRecord = await request(app)
      .post('/tenanted/compliance/records')
      .set('host', 'compliancea.platform.test')
      .set('authorization', `Bearer ${tenant.token}`)
      .send({
        applies_to: 'VEHICLE',
        target_id: vehicle.id,
        compliance_type_id: createdVehicleType.body.item.id,
        reference_number: 'REG-900',
        expiry_date: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      });
    expect(vehicleRecord.status).toBe(201);

    const listDriverRecords = await request(app)
      .get('/tenanted/compliance/records')
      .query({ applies_to: 'DRIVER', driver_id: driver.id })
      .set('host', 'compliancea.platform.test')
      .set('authorization', `Bearer ${tenant.token}`);
    expect(listDriverRecords.status).toBe(200);
    expect(listDriverRecords.body.items).toHaveLength(1);
    expect(listDriverRecords.body.items[0]).toMatchObject({
      applies_to: 'DRIVER',
      target_id: driver.id,
      reference_number: 'H2S-100',
    });
  });

  it('shows compliance expiry alerts and keeps tenant isolation', async () => {
    const platformToken = await createPlatformOwner();
    const tenantA = await createTenantWithAdmin(platformToken, 'complianceb', 'compliancebadmin');
    const tenantB = await createTenantWithAdmin(platformToken, 'compliancec', 'compliancecadmin');

    const [siteA, driverA] = await Promise.all([
      prisma.site.create({
        data: {
          tenantId: tenantA.tenantId,
          siteCode: 'A-01',
          siteName: 'Site A',
        },
      }),
      prisma.user.create({
        data: {
          tenantId: tenantA.tenantId,
          role: UserRole.DRIVER,
          fullName: 'Driver A',
          username: 'drivera',
          employeeNo: 'EMP-A',
          passwordHash: await hashPassword('DriverPass123'),
        },
      }),
    ]);
    void siteA;

    const complianceType = await prisma.complianceType.create({
      data: {
        tenantId: tenantA.tenantId,
        name: 'Driving Licence',
        appliesTo: 'DRIVER',
        requiresExpiry: true,
      },
    });

    await prisma.complianceRecord.create({
      data: {
        tenantId: tenantA.tenantId,
        complianceTypeId: complianceType.id,
        appliesTo: 'DRIVER',
        targetUserId: driverA.id,
        expiryDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      },
    });

    const tenantAAlerts = await request(app)
      .get('/tenanted/dashboard/alerts')
      .set('host', 'complianceb.platform.test')
      .set('authorization', `Bearer ${tenantA.token}`);
    expect(tenantAAlerts.status).toBe(200);
    expect(
      tenantAAlerts.body.items.some((item: { alert_type: string }) => item.alert_type === 'compliance_expiring_soon'),
    ).toBe(true);

    const tenantBAlerts = await request(app)
      .get('/tenanted/dashboard/alerts')
      .set('host', 'compliancec.platform.test')
      .set('authorization', `Bearer ${tenantB.token}`);
    expect(tenantBAlerts.status).toBe(200);
    expect(
      tenantBAlerts.body.items.some((item: { alert_type: string }) => item.alert_type === 'compliance_expiring_soon'),
    ).toBe(false);
  });
});
