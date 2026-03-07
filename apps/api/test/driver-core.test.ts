import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { PlatformUserRole, UserRole } from '@prisma/client';

import { createApp } from '../src/app';
import { prisma } from '../src/db/prisma';
import { hashPassword } from '../src/utils/password';

describe('Driver core API tests', () => {
  const app = createApp();

  async function seedPlatformOwner() {
    await prisma.platformUser.create({
      data: {
        email: process.env.PLATFORM_OWNER_EMAIL!,
        role: PlatformUserRole.PLATFORM_OWNER,
        passwordHash: await hashPassword(process.env.PLATFORM_OWNER_PASSWORD!),
      },
    });
  }

  async function createTenant(subdomain: string) {
    await seedPlatformOwner();

    const platformLogin = await request(app).post('/auth/platform-login').send({
      email: process.env.PLATFORM_OWNER_EMAIL,
      password: process.env.PLATFORM_OWNER_PASSWORD,
    });

    const createTenantResponse = await request(app)
      .post('/platform/tenants')
      .set('authorization', `Bearer ${platformLogin.body.access_token}`)
      .send({
        tenantName: 'Driver Tenant',
        subdomain,
        createInitialAdmin: true,
        initialAdmin: {
          email: `admin@${subdomain}.test`,
          username: `${subdomain}admin`,
          password: 'StrongPass123',
          fullName: 'Tenant Admin',
        },
      });

    expect(createTenantResponse.status).toBe(201);
    return createTenantResponse.body as { id: string };
  }

  it('POST /auth/login returns actor_type DRIVER for tenant driver accounts', async () => {
    const tenant = await createTenant('driverauth');
    const passwordHash = await hashPassword('DriverPass123');

    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        role: UserRole.DRIVER,
        username: 'drv001',
        employeeNo: 'EMP-001',
        fullName: 'Driver One',
        passwordHash,
      },
    });

    const response = await request(app).post('/auth/login').set('host', 'driverauth.platform.test').send({
      identifier: 'drv001',
      password: 'DriverPass123',
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      actor_type: 'DRIVER',
      role: 'DRIVER',
    });
  });

  it('driver routes are tenant-scoped and blocked for staff/admin tokens', async () => {
    const tenant = await createTenant('driversurface');
    const driverPasswordHash = await hashPassword('DriverPass123');

    const driver = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        role: UserRole.DRIVER,
        username: 'drv101',
        employeeNo: 'EMP-101',
        fullName: 'Driver Surface',
        passwordHash: driverPasswordHash,
      },
    });

    const site = await prisma.site.create({
      data: {
        tenantId: tenant.id,
        siteCode: 'SITE-01',
        siteName: 'Main Site',
      },
    });

    const vehicle = await prisma.vehicle.create({
      data: {
        tenantId: tenant.id,
        fleetNumber: 'FLEET-101',
        siteId: site.id,
      },
    });

    await prisma.driver.create({
      data: {
        tenantId: tenant.id,
        username: 'drv101',
        employeeNumber: 'EMP-101',
        fullName: 'Driver Surface',
        passwordHash: driverPasswordHash,
        siteId: site.id,
        assignedVehicleId: vehicle.id,
      },
    });

    const sectionCode = 'DRV_SECTION';
    const itemCode = 'DRV_TIRES';
    await prisma.checklistSectionMaster.upsert({
      where: { sectionCode },
      update: {
        sectionName: 'Exterior',
        sortOrder: 1,
        isActive: true,
      },
      create: {
        sectionCode,
        sectionName: 'Exterior',
        sortOrder: 1,
      },
    });
    await prisma.checklistItemMaster.upsert({
      where: { itemCode },
      update: {
        sectionCode,
        itemName: 'Tires',
        sortOrder: 1,
        isActive: true,
      },
      create: {
        itemCode,
        sectionCode,
        itemName: 'Tires',
        sortOrder: 1,
      },
    });

    const driverLogin = await request(app).post('/auth/login').set('host', 'driversurface.platform.test').send({
      identifier: 'drv101',
      password: 'DriverPass123',
    });
    expect(driverLogin.status).toBe(200);

    const adminLogin = await request(app)
      .post('/auth/login')
      .set('host', 'driversurface.platform.test')
      .send({
        identifier: 'driversurfaceadmin',
        password: 'StrongPass123',
      });
    expect(adminLogin.status).toBe(200);

    const dashboard = await request(app)
      .get('/tenanted/driver/dashboard')
      .set('host', 'driversurface.platform.test')
      .set('authorization', `Bearer ${driverLogin.body.access_token}`);
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.driver.id).toBe(driver.id);
    expect(dashboard.body.assignment.vehicle.id).toBe(vehicle.id);

    const blocked = await request(app)
      .get('/tenanted/driver/dashboard')
      .set('host', 'driversurface.platform.test')
      .set('authorization', `Bearer ${adminLogin.body.access_token}`);
    expect(blocked.status).toBe(403);

    const adminBlocked = await request(app)
      .get('/tenanted/dashboard/summary')
      .set('host', 'driversurface.platform.test')
      .set('authorization', `Bearer ${driverLogin.body.access_token}`);
    expect(adminBlocked.status).toBe(403);

    const createCheck = await request(app)
      .post('/tenanted/driver/daily-checks')
      .set('host', 'driversurface.platform.test')
      .set('authorization', `Bearer ${driverLogin.body.access_token}`)
      .send({
        check_date: '2026-03-06',
      });
    expect(createCheck.status).toBe(201);

    const submitCheck = await request(app)
      .put(`/tenanted/driver/daily-checks/${createCheck.body.id}/submit`)
      .set('host', 'driversurface.platform.test')
      .set('authorization', `Bearer ${driverLogin.body.access_token}`)
      .send({
        items: [{ item_code: itemCode, status: 'OK' }],
      });
    expect(submitCheck.status).toBe(200);

    const invalidFuel = await request(app)
      .post('/tenanted/driver/fuel-entries')
      .set('host', 'driversurface.platform.test')
      .set('authorization', `Bearer ${driverLogin.body.access_token}`)
      .send({
        entry_date: '2026-03-06',
        liters: 30,
        source_type: 'approved_source',
        odometer_fallback_used: true,
        odometer_fallback_reason: 'Sensor unavailable',
      });
    expect(invalidFuel.status).toBe(400);
    expect(invalidFuel.body.error.code).toBe('validation_error');

    const validFuel = await request(app)
      .post('/tenanted/driver/fuel-entries')
      .set('host', 'driversurface.platform.test')
      .set('authorization', `Bearer ${driverLogin.body.access_token}`)
      .send({
        entry_date: '2026-03-06',
        liters: 30,
        source_type: 'approved_source',
        approved_source_context: 'Remote approved bowser transfer',
        odometer_fallback_used: true,
        odometer_fallback_reason: 'Odometer unreadable due to glare',
      });
    expect(validFuel.status).toBe(201);
    expect(validFuel.body.entry.source_type).toBe('APPROVED_SOURCE');
    expect(validFuel.body.entry.odometer_fallback_used).toBe(true);
  });
});
