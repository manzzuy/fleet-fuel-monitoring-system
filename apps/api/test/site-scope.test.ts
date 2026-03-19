import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { DailyCheckStatus, FuelSourceType, UserRole } from '@prisma/client';

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

async function seedScopedFixture() {
  const tenant = await prisma.tenant.create({
    data: {
      name: 'Scoped Tenant',
      domains: {
        create: {
          subdomain: 'scoped',
          isPrimary: true,
        },
      },
    },
  });

  const [siteA, siteB] = await Promise.all([
    prisma.site.create({
      data: {
        tenantId: tenant.id,
        siteCode: 'SITE-A',
        siteName: 'Site A',
      },
    }),
    prisma.site.create({
      data: {
        tenantId: tenant.id,
        siteCode: 'SITE-B',
        siteName: 'Site B',
      },
    }),
  ]);

  const [vehicleA, vehicleB] = await Promise.all([
    prisma.vehicle.create({
      data: {
        tenantId: tenant.id,
        fleetNumber: 'VEH-A',
        siteId: siteA.id,
      },
    }),
    prisma.vehicle.create({
      data: {
        tenantId: tenant.id,
        fleetNumber: 'VEH-B',
        siteId: siteB.id,
      },
    }),
  ]);

  const [supervisor, safetyOfficer, transportManager, headOffice] = await Promise.all([
    prisma.user.create({
      data: {
        tenantId: tenant.id,
        role: UserRole.SITE_SUPERVISOR,
        username: 'site-supervisor',
        fullName: 'Site Supervisor',
        passwordHash: 'hashed',
      },
    }),
    prisma.user.create({
      data: {
        tenantId: tenant.id,
        role: UserRole.SAFETY_OFFICER,
        username: 'safety-officer',
        fullName: 'Safety Officer',
        passwordHash: 'hashed',
      },
    }),
    prisma.user.create({
      data: {
        tenantId: tenant.id,
        role: UserRole.TRANSPORT_MANAGER,
        username: 'transport-manager',
        fullName: 'Transport Manager',
        passwordHash: 'hashed',
      },
    }),
    prisma.user.create({
      data: {
        tenantId: tenant.id,
        role: UserRole.HEAD_OFFICE_ADMIN,
        username: 'head-office-admin',
        fullName: 'Head Office Admin',
        passwordHash: 'hashed',
      },
    }),
  ]);

  await prisma.userSiteAssignment.create({
    data: {
      tenantId: tenant.id,
      userId: supervisor.id,
      siteId: siteA.id,
    },
  });
  await prisma.userSiteAccess.createMany({
    data: [
      {
        tenantId: tenant.id,
        userId: safetyOfficer.id,
        siteId: siteA.id,
      },
      {
        tenantId: tenant.id,
        userId: safetyOfficer.id,
        siteId: siteB.id,
      },
    ],
  });

  const [checkA, checkB] = await Promise.all([
    prisma.dailyCheck.create({
      data: {
        tenantId: tenant.id,
        siteId: siteA.id,
        vehicleId: vehicleA.id,
        checkDate: new Date('2026-03-07T00:00:00.000Z'),
        status: DailyCheckStatus.SUBMITTED,
      },
    }),
    prisma.dailyCheck.create({
      data: {
        tenantId: tenant.id,
        siteId: siteB.id,
        vehicleId: vehicleB.id,
        checkDate: new Date('2026-03-07T00:00:00.000Z'),
        status: DailyCheckStatus.SUBMITTED,
      },
    }),
  ]);

  await Promise.all([
    prisma.fuelEntry.create({
      data: {
        tenantId: tenant.id,
        siteId: siteA.id,
        vehicleId: vehicleA.id,
        entryDate: new Date('2026-03-07T00:00:00.000Z'),
        liters: '20',
        sourceType: FuelSourceType.STATION,
      },
    }),
    prisma.fuelEntry.create({
      data: {
        tenantId: tenant.id,
        siteId: siteB.id,
        vehicleId: vehicleB.id,
        entryDate: new Date('2026-03-07T00:00:00.000Z'),
        liters: '30',
        sourceType: FuelSourceType.STATION,
      },
    }),
  ]);

  return { tenant, siteA, siteB, vehicleA, vehicleB, supervisor, safetyOfficer, transportManager, headOffice, checkA, checkB };
}

describe('Tenant internal site scoping', () => {
  const app = createApp();

  it('SITE_SUPERVISOR only sees assigned-site list data', async () => {
    const fixture = await seedScopedFixture();
    const token = makeToken(fixture.supervisor.id, fixture.tenant.id, UserRole.SITE_SUPERVISOR);

    const response = await request(app)
      .get('/tenanted/vehicles')
      .set('host', 'scoped.platform.test')
      .set('authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.scope_status).toBe('site_scope_limited');
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].fleet_no).toBe('VEH-A');
  });

  it('SITE_SUPERVISOR aggregates and drill-down filters stay scoped', async () => {
    const fixture = await seedScopedFixture();
    const token = makeToken(fixture.supervisor.id, fixture.tenant.id, UserRole.SITE_SUPERVISOR);

    const [dashboardResponse, fuelResponse] = await Promise.all([
      request(app)
        .get('/tenanted/dashboard/summary')
        .set('host', 'scoped.platform.test')
        .set('authorization', `Bearer ${token}`),
      request(app)
        .get('/tenanted/fuel-logs')
        .query({ site_id: fixture.siteB.id })
        .set('host', 'scoped.platform.test')
        .set('authorization', `Bearer ${token}`),
    ]);

    expect(dashboardResponse.status).toBe(200);
    expect(dashboardResponse.body.scope_status).toBe('site_scope_limited');
    expect(dashboardResponse.body.kpis.vehicles_total).toBe(1);
    expect(dashboardResponse.body.kpis.sites_total).toBe(1);

    expect(fuelResponse.status).toBe(200);
    expect(fuelResponse.body.items).toHaveLength(0);
  });

  it('SITE_SUPERVISOR detail access outside assigned scope returns 404 and logs audit event', async () => {
    const fixture = await seedScopedFixture();
    const token = makeToken(fixture.supervisor.id, fixture.tenant.id, UserRole.SITE_SUPERVISOR);

    const response = await request(app)
      .get(`/tenanted/daily-checks/${fixture.checkB.id}`)
      .set('host', 'scoped.platform.test')
      .set('authorization', `Bearer ${token}`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('daily_check_not_found');

    const auditLog = await prisma.auditLog.findFirst({
      where: {
        tenantId: fixture.tenant.id,
        actorId: fixture.supervisor.id,
        eventType: 'scope_access_denied',
      },
      orderBy: { createdAt: 'desc' },
    });

    expect(auditLog).not.toBeNull();
    expect(auditLog?.metadata).toMatchObject({
      route: '/tenanted/daily-checks/:id',
      resource_type: 'daily_check',
      resource_id: fixture.checkB.id,
    });
  });

  it('SITE_SUPERVISOR is read-only and cannot access tanks module', async () => {
    const fixture = await seedScopedFixture();
    const token = makeToken(fixture.supervisor.id, fixture.tenant.id, UserRole.SITE_SUPERVISOR);

    const [fuelWriteAttempt, tanksAccess] = await Promise.all([
      request(app)
        .post('/tenanted/fuel-entries')
        .send({})
        .set('host', 'scoped.platform.test')
        .set('authorization', `Bearer ${token}`),
      request(app)
        .get('/tenanted/tanks')
        .set('host', 'scoped.platform.test')
        .set('authorization', `Bearer ${token}`),
    ]);

    expect(fuelWriteAttempt.status).toBe(403);
    expect(fuelWriteAttempt.body.error.code).toBe('forbidden_read_only_role_write');

    expect(tanksAccess.status).toBe(403);
    expect(tanksAccess.body.error.code).toBe('forbidden_tanks_access');
  });

  it('SITE_SUPERVISOR cannot access governance routes', async () => {
    const fixture = await seedScopedFixture();
    const token = makeToken(fixture.supervisor.id, fixture.tenant.id, UserRole.SITE_SUPERVISOR);

    const [settingsAccess, sitesAccess] = await Promise.all([
      request(app)
        .get('/tenanted/tenant/settings')
        .set('host', 'scoped.platform.test')
        .set('authorization', `Bearer ${token}`),
      request(app)
        .get('/tenanted/sites')
        .set('host', 'scoped.platform.test')
        .set('authorization', `Bearer ${token}`),
    ]);

    expect(settingsAccess.status).toBe(403);
    expect(settingsAccess.body.error.code).toBe('forbidden_settings_access');

    expect(sitesAccess.status).toBe(403);
    expect(sitesAccess.body.error.code).toBe('forbidden_sites_access');
  });

  it('SAFETY_OFFICER can view assigned sites and remains read-only', async () => {
    const fixture = await seedScopedFixture();
    const token = makeToken(fixture.safetyOfficer.id, fixture.tenant.id, UserRole.SAFETY_OFFICER);

    const [vehiclesResponse, writeAttempt] = await Promise.all([
      request(app)
        .get('/tenanted/vehicles')
        .set('host', 'scoped.platform.test')
        .set('authorization', `Bearer ${token}`),
      request(app)
        .post('/tenanted/fuel-entries')
        .send({})
        .set('host', 'scoped.platform.test')
        .set('authorization', `Bearer ${token}`),
    ]);

    expect(vehiclesResponse.status).toBe(200);
    expect(vehiclesResponse.body.items).toHaveLength(2);

    expect(writeAttempt.status).toBe(403);
    expect(writeAttempt.body.error.code).toBe('forbidden_read_only_role_write');
  });

  it('SAFETY_OFFICER cannot access governance routes', async () => {
    const fixture = await seedScopedFixture();
    const token = makeToken(fixture.safetyOfficer.id, fixture.tenant.id, UserRole.SAFETY_OFFICER);

    const [settingsAccess, sitesAccess, tanksAccess] = await Promise.all([
      request(app)
        .get('/tenanted/tenant/settings')
        .set('host', 'scoped.platform.test')
        .set('authorization', `Bearer ${token}`),
      request(app)
        .get('/tenanted/sites')
        .set('host', 'scoped.platform.test')
        .set('authorization', `Bearer ${token}`),
      request(app)
        .get('/tenanted/tanks')
        .set('host', 'scoped.platform.test')
        .set('authorization', `Bearer ${token}`),
    ]);

    expect(settingsAccess.status).toBe(403);
    expect(settingsAccess.body.error.code).toBe('forbidden_settings_access');

    expect(sitesAccess.status).toBe(403);
    expect(sitesAccess.body.error.code).toBe('forbidden_sites_access');

    expect(tanksAccess.status).toBe(403);
    expect(tanksAccess.body.error.code).toBe('forbidden_tanks_access');
  });

  it('TRANSPORT_MANAGER has full tenant visibility', async () => {
    const fixture = await seedScopedFixture();
    const token = makeToken(fixture.transportManager.id, fixture.tenant.id, UserRole.TRANSPORT_MANAGER);

    const response = await request(app)
      .get('/tenanted/sites')
      .set('host', 'scoped.platform.test')
      .set('authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.scope_status).toBe('full_tenant_scope');
    expect(response.body.items).toHaveLength(2);
  });

  it('HEAD_OFFICE_ADMIN has full tenant visibility', async () => {
    const fixture = await seedScopedFixture();
    const token = makeToken(fixture.headOffice.id, fixture.tenant.id, UserRole.HEAD_OFFICE_ADMIN);

    const response = await request(app)
      .get('/tenanted/dashboard/alerts')
      .set('host', 'scoped.platform.test')
      .set('authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.scope_status).toBe('full_tenant_scope');
    expect(response.body.summary).toEqual(
      expect.objectContaining({
        date: expect.any(String),
      }),
    );
  });

  it('SITE_SUPERVISOR with no assignments receives explicit no_site_scope_assigned state on allowed routes', async () => {
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Unassigned Tenant',
        domains: {
          create: {
            subdomain: 'unassigned',
            isPrimary: true,
          },
        },
      },
    });
    const supervisor = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        role: UserRole.SITE_SUPERVISOR,
        username: 'no-scope-supervisor',
        fullName: 'No Scope Supervisor',
        passwordHash: 'hashed',
      },
    });
    const token = makeToken(supervisor.id, tenant.id, UserRole.SITE_SUPERVISOR);

    const response = await request(app)
      .get('/tenanted/vehicles')
      .set('host', 'unassigned.platform.test')
      .set('authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.scope_status).toBe('no_site_scope_assigned');
    expect(response.body.items).toHaveLength(0);
  });
});
