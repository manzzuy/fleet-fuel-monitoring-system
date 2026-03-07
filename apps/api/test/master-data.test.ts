import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { PlatformUserRole, UserRole } from '@prisma/client';

import { createApp } from '../src/app';
import { prisma } from '../src/db/prisma';
import { hashPassword } from '../src/utils/password';

describe('Master data add/edit APIs', () => {
  const app = createApp();

  async function platformToken() {
    const email = process.env.PLATFORM_OWNER_EMAIL!;
    const password = process.env.PLATFORM_OWNER_PASSWORD!;
    await prisma.platformUser.upsert({
      where: { email },
      update: { role: PlatformUserRole.PLATFORM_OWNER, passwordHash: await hashPassword(password) },
      create: { email, role: PlatformUserRole.PLATFORM_OWNER, passwordHash: await hashPassword(password) },
    });
    const login = await request(app).post('/auth/platform-login').send({ email, password });
    expect(login.status).toBe(200);
    return login.body.access_token as string;
  }

  async function createTenantAdmin(platformAccessToken: string, subdomain: string) {
    const created = await request(app)
      .post('/platform/tenants')
      .set('authorization', `Bearer ${platformAccessToken}`)
      .send({
        tenantName: `Tenant ${subdomain}`,
        subdomain,
        createInitialAdmin: true,
        initialAdmin: {
          email: `${subdomain}@admin.test`,
          username: `${subdomain}admin`,
          password: 'StrongPass123',
          fullName: `${subdomain} admin`,
        },
      });
    expect(created.status).toBe(201);

    const login = await request(app)
      .post('/auth/login')
      .set('host', `${subdomain}.platform.test`)
      .send({ identifier: `${subdomain}admin`, password: 'StrongPass123' });
    expect(login.status).toBe(200);
    return {
      tenantId: created.body.id as string,
      token: login.body.access_token as string,
    };
  }

  it('supports add/edit for drivers, vehicles, sites, tanks and writes audit logs', async () => {
    const platform = await platformToken();
    const { tenantId, token } = await createTenantAdmin(platform, 'mastercrud');
    const host = 'mastercrud.platform.test';

    const createdSite = await request(app)
      .post('/tenanted/master-data/sites')
      .set('host', host)
      .set('authorization', `Bearer ${token}`)
      .send({
        site_code: 'MST-01',
        site_name: 'Master Site',
        location: 'Muscat',
        is_active: true,
      });
    expect(createdSite.status).toBe(201);

    const siteId = createdSite.body.id as string;
    const createdVehicle = await request(app)
      .post('/tenanted/master-data/vehicles')
      .set('host', host)
      .set('authorization', `Bearer ${token}`)
      .send({
        fleet_no: 'MST-VEH-01',
        plate_no: 'M-123',
        site_id: siteId,
        is_active: true,
      });
    expect(createdVehicle.status).toBe(201);

    const vehicleId = createdVehicle.body.id as string;
    const createdDriver = await request(app)
      .post('/tenanted/master-data/drivers')
      .set('host', host)
      .set('authorization', `Bearer ${token}`)
      .send({
        full_name: 'Master Driver',
        employee_no: 'MST-DRV-01',
        username: 'masterdriver',
        site_id: siteId,
        assigned_vehicle_id: vehicleId,
        is_active: true,
      });
    expect(createdDriver.status).toBe(201);
    const driverUserId = createdDriver.body.id as string;

    const createdTank = await request(app)
      .post('/tenanted/master-data/tanks')
      .set('host', host)
      .set('authorization', `Bearer ${token}`)
      .send({
        tank_name: 'Tank A',
        capacity_l: '5000',
        reorder_level_l: '1000',
        site_id: siteId,
      });
    expect(createdTank.status).toBe(201);

    const tankId = createdTank.body.id as string;

    const fuelEntry = await prisma.fuelEntry.create({
      data: {
        tenantId,
        siteId,
        vehicleId,
        driverId: driverUserId,
        entryDate: new Date('2026-03-07'),
        liters: '50.00',
        sourceType: 'CARD',
      },
      select: { id: true },
    });
    const dailyCheck = await prisma.dailyCheck.create({
      data: {
        tenantId,
        siteId,
        vehicleId,
        driverId: driverUserId,
        checkDate: new Date('2026-03-07'),
        status: 'DRAFT',
      },
      select: { id: true },
    });

    const updateDriver = await request(app)
      .put(`/tenanted/master-data/drivers/${driverUserId}`)
      .set('host', host)
      .set('authorization', `Bearer ${token}`)
      .send({
        full_name: 'Master Driver Updated',
        is_active: false,
      });
    expect(updateDriver.status).toBe(200);

    const updateVehicle = await request(app)
      .put(`/tenanted/master-data/vehicles/${vehicleId}`)
      .set('host', host)
      .set('authorization', `Bearer ${token}`)
      .send({
        plate_no: 'M-321',
        is_active: false,
      });
    expect(updateVehicle.status).toBe(200);

    const updateSite = await request(app)
      .put(`/tenanted/master-data/sites/${siteId}`)
      .set('host', host)
      .set('authorization', `Bearer ${token}`)
      .send({
        site_name: 'Master Site Updated',
        is_active: false,
      });
    expect(updateSite.status).toBe(200);

    const updateTank = await request(app)
      .put(`/tenanted/master-data/tanks/${tankId}`)
      .set('host', host)
      .set('authorization', `Bearer ${token}`)
      .send({
        tank_name: 'Tank A Updated',
        capacity_l: '5200',
        reorder_level_l: '1200',
        site_id: siteId,
      });
    expect(updateTank.status).toBe(200);

    const [driver, vehicle, site, tank, auditCount, fuelStillThere, checkStillThere] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: driverUserId }, select: { fullName: true, isActive: true } }),
      prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId }, select: { plateNumber: true, isActive: true } }),
      prisma.site.findUniqueOrThrow({ where: { id: siteId }, select: { siteName: true, isActive: true } }),
      prisma.tank.findUniqueOrThrow({ where: { id: tankId }, select: { tankName: true } }),
      prisma.auditLog.count({
        where: {
          tenantId,
          eventType: {
            in: [
              'MASTER_DRIVER_CREATED',
              'MASTER_DRIVER_STATUS_CHANGED',
              'MASTER_VEHICLE_CREATED',
              'MASTER_VEHICLE_STATUS_CHANGED',
              'MASTER_SITE_CREATED',
              'MASTER_SITE_STATUS_CHANGED',
              'MASTER_TANK_CREATED',
              'MASTER_TANK_UPDATED',
            ],
          },
        },
      }),
      prisma.fuelEntry.findUnique({ where: { id: fuelEntry.id }, select: { id: true } }),
      prisma.dailyCheck.findUnique({ where: { id: dailyCheck.id }, select: { id: true } }),
    ]);

    expect(driver.fullName).toBe('Master Driver Updated');
    expect(driver.isActive).toBe(false);
    expect(vehicle.plateNumber).toBe('M-321');
    expect(vehicle.isActive).toBe(false);
    expect(site.siteName).toBe('Master Site Updated');
    expect(site.isActive).toBe(false);
    expect(tank.tankName).toBe('Tank A Updated');
    expect(auditCount).toBeGreaterThanOrEqual(8);
    expect(fuelStillThere?.id).toBe(fuelEntry.id);
    expect(checkStillThere?.id).toBe(dailyCheck.id);
  });

  it('enforces tenant isolation and write-scope restrictions', async () => {
    const platform = await platformToken();
    const tenantA = await createTenantAdmin(platform, 'masterscopea');
    const tenantB = await createTenantAdmin(platform, 'masterscopeb');

    const siteA = await request(app)
      .post('/tenanted/master-data/sites')
      .set('host', 'masterscopea.platform.test')
      .set('authorization', `Bearer ${tenantA.token}`)
      .send({
        site_code: 'A-1',
        site_name: 'Site A',
      });
    expect(siteA.status).toBe(201);

    const crossTenant = await request(app)
      .put(`/tenanted/master-data/sites/${siteA.body.id as string}`)
      .set('host', 'masterscopeb.platform.test')
      .set('authorization', `Bearer ${tenantA.token}`)
      .send({
        site_name: 'Cross Tenant Attempt',
      });
    expect(crossTenant.status).toBe(403);
    expect(crossTenant.body.error.code).toBe('tenant_mismatch');

    const sup = await prisma.user.create({
      data: {
        tenantId: tenantB.tenantId,
        role: UserRole.SITE_SUPERVISOR,
        username: 'sup-lock',
        fullName: 'Sup Lock',
        passwordHash: await hashPassword('StrongPass123'),
      },
      select: { id: true },
    });
    const supLogin = await request(app)
      .post('/auth/login')
      .set('host', 'masterscopeb.platform.test')
      .send({
        identifier: 'sup-lock',
        password: 'StrongPass123',
      });
    expect(supLogin.status).toBe(200);

    const supDenied = await request(app)
      .post('/tenanted/master-data/sites')
      .set('host', 'masterscopeb.platform.test')
      .set('authorization', `Bearer ${supLogin.body.access_token as string}`)
      .send({
        site_code: 'SUP-1',
        site_name: 'No Access Site',
      });
    expect(supDenied.status).toBe(403);
    expect(supDenied.body.error.code).toBe('forbidden_master_data_write');
  });
});
