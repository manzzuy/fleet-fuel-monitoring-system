import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { UserRole } from '@prisma/client';

import { createApp } from '../src/app';
import { prisma } from '../src/db/prisma';
import { hashPassword } from '../src/utils/password';

async function createTenant(_app: ReturnType<typeof createApp>, subdomain: string) {
  const tenant = await prisma.tenant.create({
    data: {
      name: `Tenant ${subdomain}`,
      status: 'ACTIVE',
    },
  });

  await prisma.tenantDomain.create({
    data: {
      tenantId: tenant.id,
      subdomain,
      isPrimary: true,
    },
  });

  await prisma.user.create({
    data: {
      tenantId: tenant.id,
      role: UserRole.COMPANY_ADMIN,
      email: `admin@${subdomain}.test`,
      username: `${subdomain}admin`,
      fullName: 'Tenant Admin',
      passwordHash: await hashPassword('StrongPass123'),
      isActive: true,
    },
  });

  return { id: tenant.id };
}

async function seedChecklistAndDriver(tenantId: string, username: string, employeeNo: string) {
  const passwordHash = await hashPassword('DriverPass123');

  const driverUser = await prisma.user.create({
    data: {
      tenantId,
      role: UserRole.DRIVER,
      username,
      employeeNo,
      fullName: `Driver ${username}`,
      passwordHash,
    },
  });

  const site = await prisma.site.create({
    data: {
      tenantId,
      siteCode: `SITE-${username.toUpperCase()}`,
      siteName: `Site ${username}`,
    },
  });

  const vehicle = await prisma.vehicle.create({
    data: {
      tenantId,
      fleetNumber: `FLEET-${username.toUpperCase()}`,
      siteId: site.id,
    },
  });

  await prisma.driver.create({
    data: {
      tenantId,
      username,
      employeeNumber: employeeNo,
      fullName: `Driver ${username}`,
      passwordHash,
      siteId: site.id,
      assignedVehicleId: vehicle.id,
    },
  });

  const sectionCode = `S_${username.toUpperCase()}`;
  const itemCode = `I_${username.toUpperCase()}`;

  await prisma.checklistSectionMaster.upsert({
    where: { sectionCode },
    update: {
      sectionName: 'Pre-start',
      sortOrder: 1,
      isActive: true,
    },
    create: {
      sectionCode,
      sectionName: 'Pre-start',
      sortOrder: 1,
      isActive: true,
    },
  });

  await prisma.checklistItemMaster.upsert({
    where: { itemCode },
    update: {
      sectionCode,
      itemName: 'Lights check',
      sortOrder: 1,
      requiredItem: true,
      isActive: true,
    },
    create: {
      itemCode,
      sectionCode,
      itemName: 'Lights check',
      sortOrder: 1,
      requiredItem: true,
      isActive: true,
    },
  });

  return { driverUser, itemCode };
}

describe('Driver daily checklist API', () => {
  const app = createApp();

  it('fetches checklist master for authorized tenant driver', async () => {
    const tenant = await createTenant(app, 'drivercheckfetch');
    const { itemCode } = await seedChecklistAndDriver(tenant.id, 'drvfetch', 'EMP-FETCH');

    const login = await request(app).post('/auth/login').set('host', 'drivercheckfetch.platform.test').send({
      identifier: 'drvfetch',
      password: 'DriverPass123',
    });

    const response = await request(app)
      .get('/tenanted/driver/checklists/master')
      .set('host', 'drivercheckfetch.platform.test')
      .set('authorization', `Bearer ${login.body.access_token}`);

    expect(response.status).toBe(200);
    expect(response.body.sections.length).toBeGreaterThan(0);
    const allItemCodes = response.body.sections.flatMap((section: { items: Array<{ item_code: string }> }) =>
      section.items.map((item) => item.item_code),
    );
    expect(allItemCodes).toContain(itemCode);
    expect(response.body.request_id).toBeTypeOf('string');
  });

  it('creates and submits a daily check for driver in same tenant', async () => {
    const tenant = await createTenant(app, 'driverchecksubmit');
    const { itemCode } = await seedChecklistAndDriver(tenant.id, 'drvsubmit', 'EMP-SUBMIT');

    const login = await request(app).post('/auth/login').set('host', 'driverchecksubmit.platform.test').send({
      identifier: 'drvsubmit',
      password: 'DriverPass123',
    });

    const createResponse = await request(app)
      .post('/tenanted/driver/daily-checks')
      .set('host', 'driverchecksubmit.platform.test')
      .set('authorization', `Bearer ${login.body.access_token}`)
      .send({ check_date: '2026-03-06' });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.status).toBe('DRAFT');

    const submitResponse = await request(app)
      .put(`/tenanted/driver/daily-checks/${createResponse.body.id}/submit`)
      .set('host', 'driverchecksubmit.platform.test')
      .set('authorization', `Bearer ${login.body.access_token}`)
      .send({
        items: [{ item_code: itemCode, status: 'OK', notes: 'All good' }],
      });

    expect(submitResponse.status).toBe(200);
    expect(submitResponse.body.status).toBe('SUBMITTED');

    const saved = await prisma.dailyCheck.findUnique({ where: { id: createResponse.body.id } });
    expect(saved?.createdBy).toBeTruthy();

    const auditEvents = await prisma.auditLog.findMany({
      where: {
        tenantId: tenant.id,
        eventType: { in: ['DRIVER_DAILY_CHECK_CREATED', 'DRIVER_DAILY_CHECK_SUBMITTED'] },
      },
      orderBy: { createdAt: 'asc' },
    });
    expect(auditEvents.map((event) => event.eventType)).toEqual([
      'DRIVER_DAILY_CHECK_CREATED',
      'DRIVER_DAILY_CHECK_SUBMITTED',
    ]);
  });

  it('returns validation failure when submitting unknown checklist item', async () => {
    const tenant = await createTenant(app, 'drivercheckinvalid');
    await seedChecklistAndDriver(tenant.id, 'drvinvalid', 'EMP-INVALID');

    const login = await request(app).post('/auth/login').set('host', 'drivercheckinvalid.platform.test').send({
      identifier: 'drvinvalid',
      password: 'DriverPass123',
    });

    const createResponse = await request(app)
      .post('/tenanted/driver/daily-checks')
      .set('host', 'drivercheckinvalid.platform.test')
      .set('authorization', `Bearer ${login.body.access_token}`)
      .send({ check_date: '2026-03-06' });

    const submitResponse = await request(app)
      .put(`/tenanted/driver/daily-checks/${createResponse.body.id}/submit`)
      .set('host', 'drivercheckinvalid.platform.test')
      .set('authorization', `Bearer ${login.body.access_token}`)
      .send({
        items: [{ item_code: 'UNKNOWN_CODE', status: 'OK' }],
      });

    expect(submitResponse.status).toBe(400);
    expect(submitResponse.body.error.code).toBe('invalid_checklist_item');
  });

  it('rejects checklist routes without auth token', async () => {
    await createTenant(app, 'drivercheckunauth');
    const response = await request(app)
      .get('/tenanted/driver/checklists/master')
      .set('host', 'drivercheckunauth.platform.test');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('missing_auth');
  });

  it('rejects checklist routes for staff tokens', async () => {
    await createTenant(app, 'drivercheckstaff');

    const adminLogin = await request(app).post('/auth/login').set('host', 'drivercheckstaff.platform.test').send({
      identifier: 'drivercheckstaffadmin',
      password: 'StrongPass123',
    });
    expect(adminLogin.status).toBe(200);

    const response = await request(app)
      .get('/tenanted/driver/checklists/master')
      .set('host', 'drivercheckstaff.platform.test')
      .set('authorization', `Bearer ${adminLogin.body.access_token}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('forbidden_surface_access');
  });

  it('rejects checklist access when tenant host mismatches token tenant', async () => {
    const tenantA = await createTenant(app, 'driverchecktenanta');
    const tenantB = await createTenant(app, 'driverchecktenantb');
    await seedChecklistAndDriver(tenantA.id, 'drva', 'EMP-A');
    await seedChecklistAndDriver(tenantB.id, 'drvb', 'EMP-B');

    const loginA = await request(app).post('/auth/login').set('host', 'driverchecktenanta.platform.test').send({
      identifier: 'drva',
      password: 'DriverPass123',
    });

    const response = await request(app)
      .get('/tenanted/driver/checklists/master')
      .set('host', 'driverchecktenantb.platform.test')
      .set('authorization', `Bearer ${loginA.body.access_token}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('tenant_mismatch');
  });
});
