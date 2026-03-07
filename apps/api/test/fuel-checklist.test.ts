import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { PlatformUserRole, UserRole } from '@prisma/client';

import { createApp } from '../src/app';
import { prisma } from '../src/db/prisma';
import { hashPassword } from '../src/utils/password';

describe('Fuel + Daily checklist integration', () => {
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

  it('creates fuel entries + daily checks with strict tenant scoping', async () => {
    const platformToken = await createPlatformOwner();
    const tenantA = await createTenantWithAdmin(platformToken, 'phase1corea', 'coreadmina');
    const tenantB = await createTenantWithAdmin(platformToken, 'phase1coreb', 'coreadminb');

    const site = await prisma.site.create({
      data: {
        tenantId: tenantA.tenantId,
        siteCode: 'MAIN',
        siteName: 'Main Yard',
      },
    });

    const vehicle = await prisma.vehicle.create({
      data: {
        tenantId: tenantA.tenantId,
        fleetNumber: 'FL-100',
        plateNumber: 'ABC-100',
        siteId: site.id,
      },
    });

    const driver = await prisma.user.create({
      data: {
        tenantId: tenantA.tenantId,
        role: UserRole.DRIVER,
        username: 'driver-a',
        employeeNo: 'EMP-100',
        fullName: 'Driver A',
        passwordHash: await hashPassword('DriverPass123'),
      },
    });

    const fuelCard = await prisma.fuelCard.create({
      data: {
        tenantId: tenantA.tenantId,
        cardNumber: 'CARD-100',
        assignedVehicleId: vehicle.id,
      },
    });

    const createFuel = await request(app)
      .post('/tenanted/fuel-entries')
      .set('host', 'phase1corea.platform.test')
      .set('authorization', `Bearer ${tenantA.token}`)
      .send({
        fleet_no: 'FL-100',
        driver_id: driver.id,
        site_id: site.id,
        entry_date: '2026-03-06',
        odometer_km: 123450,
        liters: 68.3,
        source_type: 'CARD',
        fuel_card_id: fuelCard.id,
        notes: 'Initial fill',
      });

    expect(createFuel.status).toBe(201);
    expect(createFuel.body.entry.vehicle.fleet_no).toBe('FL-100');

    const listFuel = await request(app)
      .get('/tenanted/fuel-entries?limit=10')
      .set('host', 'phase1corea.platform.test')
      .set('authorization', `Bearer ${tenantA.token}`);

    expect(listFuel.status).toBe(200);
    expect(listFuel.body.items.length).toBeGreaterThanOrEqual(1);

    const filteredFuel = await request(app)
      .get('/tenanted/fuel-logs')
      .query({
        related_record_id: createFuel.body.entry.id,
        vehicle_id: vehicle.id,
        driver_id: driver.id,
        site_id: site.id,
        source_type: 'CARD',
      })
      .set('host', 'phase1corea.platform.test')
      .set('authorization', `Bearer ${tenantA.token}`);

    expect(filteredFuel.status).toBe(200);
    expect(filteredFuel.body.items).toHaveLength(1);
    expect(filteredFuel.body.items[0].id).toBe(createFuel.body.entry.id);

    const checklistMaster = await request(app)
      .get('/tenanted/checklists/master')
      .set('host', 'phase1corea.platform.test')
      .set('authorization', `Bearer ${tenantA.token}`);
    expect(checklistMaster.status).toBe(200);
    expect(checklistMaster.body.sections.length).toBeGreaterThan(0);

    const createDailyCheck = await request(app)
      .post('/tenanted/daily-checks')
      .set('host', 'phase1corea.platform.test')
      .set('authorization', `Bearer ${tenantA.token}`)
      .send({
        vehicle_id: vehicle.id,
        driver_id: driver.id,
        site_id: site.id,
        check_date: '2026-03-06',
      });
    expect(createDailyCheck.status).toBe(201);

    const firstItemCode = checklistMaster.body.sections[0].items[0].item_code as string;
    const secondItemCode = checklistMaster.body.sections[0].items[1]?.item_code as string | undefined;

    const submitDailyCheck = await request(app)
      .put(`/tenanted/daily-checks/${createDailyCheck.body.id}/submit`)
      .set('host', 'phase1corea.platform.test')
      .set('authorization', `Bearer ${tenantA.token}`)
      .send({
        items: [
          { item_code: firstItemCode, status: 'OK', notes: 'Checked' },
          ...(secondItemCode ? [{ item_code: secondItemCode, status: 'NA' }] : []),
        ],
      });
    expect(submitDailyCheck.status).toBe(200);
    expect(submitDailyCheck.body.status).toBe('SUBMITTED');

    const listDailyChecks = await request(app)
      .get('/tenanted/daily-checks?date=2026-03-06&status=SUBMITTED')
      .set('host', 'phase1corea.platform.test')
      .set('authorization', `Bearer ${tenantA.token}`);

    expect(listDailyChecks.status).toBe(200);
    expect(listDailyChecks.body.items.length).toBeGreaterThanOrEqual(1);
    expect(listDailyChecks.body.items[0].stats.ok_count).toBeGreaterThanOrEqual(1);

    const dashboard = await request(app)
      .get('/tenanted/dashboard/summary')
      .set('host', 'phase1corea.platform.test')
      .set('authorization', `Bearer ${tenantA.token}`);
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.kpis.vehicles_total).toBeGreaterThan(0);
    expect(dashboard.body.fuel_entries_recent.length).toBeGreaterThan(0);
    expect(dashboard.body.daily_checks_today.submitted_count).toBeGreaterThanOrEqual(0);

    const tenantBListFuel = await request(app)
      .get('/tenanted/fuel-entries?limit=10')
      .set('host', 'phase1coreb.platform.test')
      .set('authorization', `Bearer ${tenantB.token}`);
    expect(tenantBListFuel.status).toBe(200);
    expect(tenantBListFuel.body.items).toHaveLength(0);

    const tenantBTryCreateWithTenantAVehicle = await request(app)
      .post('/tenanted/fuel-entries')
      .set('host', 'phase1coreb.platform.test')
      .set('authorization', `Bearer ${tenantB.token}`)
      .send({
        vehicle_id: vehicle.id,
        entry_date: '2026-03-06',
        odometer_km: 100,
        liters: 10,
        source_type: 'MANUAL',
      });
    expect(tenantBTryCreateWithTenantAVehicle.status).toBe(404);
    expect(tenantBTryCreateWithTenantAVehicle.body.error.code).toBe('vehicle_not_found');
  });
});
