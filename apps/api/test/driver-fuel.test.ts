import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { UserRole } from '@prisma/client';

import { createApp } from '../src/app';
import { prisma } from '../src/db/prisma';
import { hashPassword } from '../src/utils/password';

async function createTenant(subdomain: string) {
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

  return tenant;
}

async function seedDriverContext(tenantId: string, username: string, employeeNo: string) {
  const passwordHash = await hashPassword('DriverPass123');

  const driverUser = await prisma.user.create({
    data: {
      tenantId,
      role: UserRole.DRIVER,
      username,
      employeeNo,
      fullName: `Driver ${username}`,
      passwordHash,
      isActive: true,
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

  return { driverUser, site, vehicle };
}

async function loginDriver(app: ReturnType<typeof createApp>, subdomain: string, identifier: string) {
  const response = await request(app).post('/auth/login').set('host', `${subdomain}.platform.test`).send({
    identifier,
    password: 'DriverPass123',
  });
  expect(response.status).toBe(200);
  return response.body.access_token as string;
}

describe('Driver fuel entry API', () => {
  const app = createApp();

  it('creates fuel entry successfully for tenant driver', async () => {
    const subdomain = `driverfuelsuccess${randomUUID().slice(0, 8)}`;
    const tenant = await createTenant(subdomain);
    await seedDriverContext(tenant.id, 'drvfuelsuccess', 'EMP-FUEL-SUCCESS');

    const token = await loginDriver(app, subdomain, 'drvfuelsuccess');

    const response = await request(app)
      .post('/tenanted/driver/fuel-entries')
      .set('host', `${subdomain}.platform.test`)
      .set('authorization', `Bearer ${token}`)
      .send({
        entry_date: '2026-03-06',
        liters: 42.5,
        source_type: 'station',
        fuel_station_id: 'MUSCAT-01',
        odometer_km: 120500,
      });

    expect(response.status).toBe(201);
    expect(response.body.entry.source_type).toBe('STATION');
    expect(response.body.entry.odometer_fallback_used).toBe(false);
    expect(response.body.request_id).toBeTypeOf('string');

    const auditEvent = await prisma.auditLog.findFirst({
      where: {
        tenantId: tenant.id,
        eventType: 'DRIVER_FUEL_ENTRY_SUBMITTED',
      },
    });
    expect(auditEvent).toBeTruthy();
  });

  it('rejects invalid source_type', async () => {
    const subdomain = `driverfuelbadsource${randomUUID().slice(0, 8)}`;
    const tenant = await createTenant(subdomain);
    await seedDriverContext(tenant.id, 'drvbadsource', 'EMP-BAD-SOURCE');
    const token = await loginDriver(app, subdomain, 'drvbadsource');

    const response = await request(app)
      .post('/tenanted/driver/fuel-entries')
      .set('host', `${subdomain}.platform.test`)
      .set('authorization', `Bearer ${token}`)
      .send({
        entry_date: '2026-03-06',
        liters: 20,
        source_type: 'manual',
        odometer_km: 1000,
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('validation_error');
  });

  it('rejects approved_source without approved_source_context', async () => {
    const subdomain = `driverfuelapproved${randomUUID().slice(0, 8)}`;
    const tenant = await createTenant(subdomain);
    await seedDriverContext(tenant.id, 'drvapproved', 'EMP-APPROVED');
    const token = await loginDriver(app, subdomain, 'drvapproved');

    const response = await request(app)
      .post('/tenanted/driver/fuel-entries')
      .set('host', `${subdomain}.platform.test`)
      .set('authorization', `Bearer ${token}`)
      .send({
        entry_date: '2026-03-06',
        liters: 20,
        source_type: 'approved_source',
        odometer_km: 1000,
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('validation_error');
    expect(JSON.stringify(response.body.error.details)).toContain('approved_source_context');
  });

  it('rejects odometer fallback when reason is missing', async () => {
    const subdomain = `driverfuelfallback${randomUUID().slice(0, 8)}`;
    const tenant = await createTenant(subdomain);
    await seedDriverContext(tenant.id, 'drvfallback', 'EMP-FALLBACK');
    const token = await loginDriver(app, subdomain, 'drvfallback');

    const response = await request(app)
      .post('/tenanted/driver/fuel-entries')
      .set('host', `${subdomain}.platform.test`)
      .set('authorization', `Bearer ${token}`)
      .send({
        entry_date: '2026-03-06',
        liters: 30,
        source_type: 'station',
        fuel_station_id: 'MUSCAT-01',
        odometer_fallback_used: true,
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('validation_error');
    expect(JSON.stringify(response.body.error.details)).toContain('odometer_fallback_reason');
  });

  it('rejects fuel entry and receipt upload without auth', async () => {
    const subdomain = `driverfuelunauth${randomUUID().slice(0, 8)}`;
    await createTenant(subdomain);

    const response = await request(app).post('/tenanted/driver/fuel-entries').set('host', 'unauthfuel.platform.test').send({
      entry_date: '2026-03-06',
      liters: 10,
      source_type: 'station',
      odometer_km: 500,
    });
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('tenant_not_found');

    const tenantScopedResponse = await request(app)
      .post('/tenanted/driver/fuel-entries')
      .set('host', `${subdomain}.platform.test`)
      .send({
        entry_date: '2026-03-06',
        liters: 10,
        source_type: 'station',
        odometer_km: 500,
      });
    expect(tenantScopedResponse.status).toBe(401);
    expect(tenantScopedResponse.body.error.code).toBe('missing_auth');

    const receiptResponse = await request(app)
      .post('/tenanted/driver/receipts/upload')
      .set('host', `${subdomain}.platform.test`);
    expect(receiptResponse.status).toBe(401);
    expect(receiptResponse.body.error.code).toBe('missing_auth');
  });

  it('rejects cross-tenant write attempts', async () => {
    const subdomainA = `driverfuela${randomUUID().slice(0, 8)}`;
    const subdomainB = `driverfuelb${randomUUID().slice(0, 8)}`;

    const tenantA = await createTenant(subdomainA);
    await createTenant(subdomainB);
    await seedDriverContext(tenantA.id, 'drvcross', 'EMP-CROSS');
    const tokenA = await loginDriver(app, subdomainA, 'drvcross');

    const response = await request(app)
      .post('/tenanted/driver/fuel-entries')
      .set('host', `${subdomainB}.platform.test`)
      .set('authorization', `Bearer ${tokenA}`)
      .send({
        entry_date: '2026-03-06',
        liters: 18,
        source_type: 'station',
        fuel_station_id: 'B-01',
        odometer_km: 6000,
      });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('tenant_mismatch');
  });

  it('validates receipt upload media type and accepts image payloads', async () => {
    const subdomain = `driverfuelreceipt${randomUUID().slice(0, 8)}`;
    const tenant = await createTenant(subdomain);
    await seedDriverContext(tenant.id, 'drvreceipt', 'EMP-RECEIPT');
    const token = await loginDriver(app, subdomain, 'drvreceipt');

    const badReceipt = await request(app)
      .post('/tenanted/driver/receipts/upload')
      .set('host', `${subdomain}.platform.test`)
      .set('authorization', `Bearer ${token}`)
      .attach('receipt', Buffer.from('not an image'), {
        filename: 'receipt.txt',
        contentType: 'text/plain',
      });

    expect(badReceipt.status).toBe(400);
    expect(badReceipt.body.error.code).toBe('invalid_receipt_type');

    const okReceipt = await request(app)
      .post('/tenanted/driver/receipts/upload')
      .set('host', `${subdomain}.platform.test`)
      .set('authorization', `Bearer ${token}`)
      .attach('receipt', Buffer.from([0x89, 0x50, 0x4e, 0x47]), {
        filename: 'receipt.png',
        contentType: 'image/png',
      });

    expect(okReceipt.status).toBe(201);
    expect(okReceipt.body.receipt_url).toContain(`/storage/receipts/${tenant.id}/`);
  });
});
