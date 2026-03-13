import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { PlatformUserRole } from '@prisma/client';

import { createApp } from '../src/app';
import { prisma } from '../src/db/prisma';
import { signAccessToken } from '../src/utils/jwt';
import { hashPassword } from '../src/utils/password';

describe('API smoke tests', () => {
  const app = createApp();

  async function createPlatformOwner() {
    await prisma.platformUser.upsert({
      where: {
        email: process.env.PLATFORM_OWNER_EMAIL!,
      },
      update: {
        role: PlatformUserRole.PLATFORM_OWNER,
        passwordHash: await hashPassword(process.env.PLATFORM_OWNER_PASSWORD!),
      },
      create: {
        email: process.env.PLATFORM_OWNER_EMAIL!,
        role: PlatformUserRole.PLATFORM_OWNER,
        passwordHash: await hashPassword(process.env.PLATFORM_OWNER_PASSWORD!),
      },
    });
  }

  it('GET /health returns 200 with a basic JSON body', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'ok',
      service: 'api',
    });
    expect(response.body.request_id).toEqual(expect.any(String));
  });

  it('GET /tenanted/health returns 404 for an unknown tenant subdomain', async () => {
    const response = await request(app)
      .get('/tenanted/health')
      .set('host', 'unknown.platform.test');

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      error: {
        code: 'tenant_not_found',
        message: 'Tenant could not be resolved from host.',
      },
    });
    expect(response.body.request_id).toEqual(expect.any(String));
  });

  it('GET /tenanted/health returns tenant_id and subdomain for an existing tenant', async () => {
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Test Fleet',
        domains: {
          create: {
            subdomain: 'maqshan',
            isPrimary: true,
          },
        },
      },
    });

    const response = await request(app)
      .get('/tenanted/health')
      .set('host', 'maqshan.platform.test');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'ok',
      tenant_id: tenant.id,
      subdomain: 'maqshan',
    });
  });

  it('POST /auth/platform-login returns a JWT for the seeded platform owner', async () => {
    await createPlatformOwner();

    const response = await request(app).post('/auth/platform-login').send({
      email: process.env.PLATFORM_OWNER_EMAIL,
      password: process.env.PLATFORM_OWNER_PASSWORD,
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      token_type: 'Bearer',
      tenant_id: null,
      role: 'PLATFORM_OWNER',
      actor_type: 'PLATFORM',
    });
    expect(response.body.access_token).toEqual(expect.any(String));
  });

  it('POST /platform/tenants rejects requests without a platform token', async () => {
    const response = await request(app).post('/platform/tenants').send({
      tenantName: 'Fleet One',
      subdomain: 'fleetone',
      createInitialAdmin: false,
    });

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      error: {
        code: 'missing_auth',
        message: 'Authorization header is required.',
      },
    });
    expect(response.body.request_id).toEqual(expect.any(String));
  });

  it('GET /platform/onboarding/preflight returns DB readiness for platform owners', async () => {
    await createPlatformOwner();

    const login = await request(app).post('/auth/platform-login').send({
      email: process.env.PLATFORM_OWNER_EMAIL,
      password: process.env.PLATFORM_OWNER_PASSWORD,
    });

    const response = await request(app)
      .get('/platform/onboarding/preflight')
      .set('authorization', `Bearer ${login.body.access_token}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'ok',
      db: {
        ready: expect.any(Boolean),
        missing_tables: expect.any(Array),
      },
      request_id: expect.any(String),
    });
  });

  it('POST /platform/tenants creates a tenant with an initial company admin', async () => {
    await createPlatformOwner();

    const login = await request(app).post('/auth/platform-login').send({
      email: process.env.PLATFORM_OWNER_EMAIL,
      password: process.env.PLATFORM_OWNER_PASSWORD,
    });

    const response = await request(app)
      .post('/platform/tenants')
      .set('authorization', `Bearer ${login.body.access_token}`)
      .send({
        tenantName: 'Fleet One',
        subdomain: 'fleetone',
        createInitialAdmin: true,
        initialAdmin: {
          email: 'admin@fleetone.test',
          username: 'fleetadmin',
          password: 'StrongPass123',
          fullName: 'Fleet Admin',
        },
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      name: 'Fleet One',
      status: 'ACTIVE',
      primary_subdomain: 'fleetone',
      initial_admin: {
        email: 'admin@fleetone.test',
        username: 'fleetadmin',
        full_name: 'Fleet Admin',
        role: 'COMPANY_ADMIN',
      },
    });
    expect(response.body.initial_admin.id).toEqual(expect.any(String));
  });

  it('POST /auth/login succeeds for a tenant company admin on the correct subdomain', async () => {
    await createPlatformOwner();

    const platformLogin = await request(app).post('/auth/platform-login').send({
      email: process.env.PLATFORM_OWNER_EMAIL,
      password: process.env.PLATFORM_OWNER_PASSWORD,
    });

    const createTenantResponse = await request(app)
      .post('/platform/tenants')
      .set('authorization', `Bearer ${platformLogin.body.access_token}`)
      .send({
        tenantName: 'Fleet Two',
        subdomain: 'fleettwo',
        createInitialAdmin: true,
        initialAdmin: {
          email: 'admin@fleettwo.test',
          username: 'fleettwoadmin',
          password: 'StrongPass123',
          fullName: 'Fleet Two Admin',
        },
      });

    const response = await request(app)
      .post('/auth/login')
      .set('host', 'fleettwo.platform.test')
      .send({
        identifier: 'fleettwoadmin',
        password: 'StrongPass123',
      });

    expect(createTenantResponse.status).toBe(201);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      tenant_id: createTenantResponse.body.id,
      role: 'COMPANY_ADMIN',
      actor_type: 'STAFF',
      token_type: 'Bearer',
    });
    expect(response.body.access_token).toEqual(expect.any(String));
  });

  it('POST /auth/login fails on the wrong tenant subdomain', async () => {
    await createPlatformOwner();

    const platformLogin = await request(app).post('/auth/platform-login').send({
      email: process.env.PLATFORM_OWNER_EMAIL,
      password: process.env.PLATFORM_OWNER_PASSWORD,
    });

    await request(app)
      .post('/platform/tenants')
      .set('authorization', `Bearer ${platformLogin.body.access_token}`)
      .send({
        tenantName: 'Tenant Alpha',
        subdomain: 'tenantalpha',
        createInitialAdmin: true,
        initialAdmin: {
          email: 'admin@tenantalpha.test',
          username: 'alphaadmin',
          password: 'StrongPass123',
          fullName: 'Tenant Alpha Admin',
        },
      });

    await request(app)
      .post('/platform/tenants')
      .set('authorization', `Bearer ${platformLogin.body.access_token}`)
      .send({
        tenantName: 'Tenant Beta',
        subdomain: 'tenantbeta',
        createInitialAdmin: false,
      });

    const response = await request(app)
      .post('/auth/login')
      .set('host', 'tenantbeta.platform.test')
      .send({
        identifier: 'alphaadmin',
        password: 'StrongPass123',
      });

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      error: {
        code: 'invalid_credentials',
        message: 'Invalid credentials.',
      },
    });
    expect(response.body.request_id).toEqual(expect.any(String));
  });

  it('GET /tenanted/dashboard/summary returns tenant-scoped KPIs and recent lists', async () => {
    await createPlatformOwner();

    const platformLogin = await request(app).post('/auth/platform-login').send({
      email: process.env.PLATFORM_OWNER_EMAIL,
      password: process.env.PLATFORM_OWNER_PASSWORD,
    });

    const createTenantResponse = await request(app)
      .post('/platform/tenants')
      .set('authorization', `Bearer ${platformLogin.body.access_token}`)
      .send({
        tenantName: 'Dashboard Fleet',
        subdomain: 'dashfleet',
        createInitialAdmin: true,
        initialAdmin: {
          email: 'admin@dashfleet.test',
          username: 'dashadmin',
          password: 'StrongPass123',
          fullName: 'Dashboard Admin',
        },
      });

    const tenantLoginResponse = await request(app)
      .post('/auth/login')
      .set('host', 'dashfleet.platform.test')
      .send({
        identifier: 'dashadmin',
        password: 'StrongPass123',
      });

    const response = await request(app)
      .get('/tenanted/dashboard/summary')
      .set('host', 'dashfleet.platform.test')
      .set('authorization', `Bearer ${tenantLoginResponse.body.access_token}`);

    expect(createTenantResponse.status).toBe(201);
    expect(tenantLoginResponse.status).toBe(200);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      tenant: {
        id: createTenantResponse.body.id,
        subdomain: 'dashfleet',
      },
      kpis: {
        vehicles_total: expect.any(Number),
        drivers_total: expect.any(Number),
        fuel_cards_total: expect.any(Number),
        sites_total: expect.any(Number),
        tanks_total: expect.any(Number),
      },
      onboarding: {
        last_batch: null,
      },
      monitoring_summary: {
        vehicles_missing_daily_check: expect.any(Number),
        high_risk_fuel_alerts: expect.any(Number),
        compliance_expired: expect.any(Number),
        compliance_expiring_soon: expect.any(Number),
        receipt_gaps: expect.any(Number),
        checklist_issues_today: expect.any(Number),
        fuel_entries_today: expect.any(Number),
        fuel_missing_receipt: expect.any(Number),
        fuel_odometer_fallback: expect.any(Number),
        approved_source_usage: expect.any(Number),
        high_priority_exceptions: expect.any(Number),
        total_alerts: expect.any(Number),
      },
      urgent_exceptions: expect.any(Array),
      recent: {
        vehicles: expect.any(Array),
        drivers: expect.any(Array),
        fuel_entries: expect.any(Array),
        alerts: expect.any(Array),
      },
      request_id: expect.any(String),
    });
  });

  it('GET /tenanted/dashboard/summary reports missing daily checks from active vehicles without submitted checks', async () => {
    await createPlatformOwner();

    const platformLogin = await request(app).post('/auth/platform-login').send({
      email: process.env.PLATFORM_OWNER_EMAIL,
      password: process.env.PLATFORM_OWNER_PASSWORD,
    });

    const createTenantResponse = await request(app)
      .post('/platform/tenants')
      .set('authorization', `Bearer ${platformLogin.body.access_token}`)
      .send({
        tenantName: 'Missing Checks Fleet',
        subdomain: 'missingchecks',
        createInitialAdmin: true,
        initialAdmin: {
          email: 'admin@missingchecks.test',
          username: 'missingadmin',
          password: 'StrongPass123',
          fullName: 'Missing Checks Admin',
        },
      });

    await prisma.vehicle.create({
      data: {
        tenantId: createTenantResponse.body.id,
        fleetNumber: 'MISSING-001',
      },
    });

    const tenantLoginResponse = await request(app)
      .post('/auth/login')
      .set('host', 'missingchecks.platform.test')
      .send({
        identifier: 'missingadmin',
        password: 'StrongPass123',
      });

    const response = await request(app)
      .get('/tenanted/dashboard/summary')
      .set('host', 'missingchecks.platform.test')
      .set('authorization', `Bearer ${tenantLoginResponse.body.access_token}`);

    expect(createTenantResponse.status).toBe(201);
    expect(tenantLoginResponse.status).toBe(200);
    expect(response.status).toBe(200);
    expect(response.body.monitoring_summary.vehicles_missing_daily_check).toBe(1);
  });

  it('GET tenant monitoring endpoints return tenant-scoped read models', async () => {
    await createPlatformOwner();

    const platformLogin = await request(app).post('/auth/platform-login').send({
      email: process.env.PLATFORM_OWNER_EMAIL,
      password: process.env.PLATFORM_OWNER_PASSWORD,
    });

    await request(app)
      .post('/platform/tenants')
      .set('authorization', `Bearer ${platformLogin.body.access_token}`)
      .send({
        tenantName: 'Read Fleet',
        subdomain: 'readfleet',
        createInitialAdmin: true,
        initialAdmin: {
          email: 'admin@readfleet.test',
          username: 'readadmin',
          password: 'StrongPass123',
          fullName: 'Read Admin',
        },
      });

    const tenantToken = signAccessToken({
      sub: 'test-read-admin',
      tenant_id: (await prisma.tenantDomain.findUniqueOrThrow({ where: { subdomain: 'readfleet' } })).tenantId,
      role: 'COMPANY_ADMIN',
      actor_type: 'STAFF',
    });

    const authHeader = { authorization: `Bearer ${tenantToken}` };
    const hostHeader = { host: 'readfleet.platform.test' };

    const [fuelLogs, dailyChecks, drivers, vehicles, sites, tanks, settings, systemStatus] = await Promise.all([
      request(app).get('/tenanted/fuel-logs').set(hostHeader).set(authHeader),
      request(app).get('/tenanted/daily-checks').set(hostHeader).set(authHeader),
      request(app).get('/tenanted/drivers').set(hostHeader).set(authHeader),
      request(app).get('/tenanted/vehicles').set(hostHeader).set(authHeader),
      request(app).get('/tenanted/sites').set(hostHeader).set(authHeader),
      request(app).get('/tenanted/tanks').set(hostHeader).set(authHeader),
      request(app).get('/tenanted/tenant/settings').set(hostHeader).set(authHeader),
      request(app).get('/tenanted/system/status').set(hostHeader).set(authHeader),
    ]);

    for (const response of [fuelLogs, dailyChecks, drivers, vehicles, sites, tanks, settings, systemStatus]) {
      expect(response.status).toBe(200);
      expect(response.body.request_id).toEqual(expect.any(String));
    }

    expect(settings.body).toMatchObject({
      tenant: {
        primary_subdomain: 'readfleet',
      },
      features: {
        fuel_submission_via_admin: false,
        daily_check_submission_via_admin: false,
      },
    });
    expect(systemStatus.body).toMatchObject({
      status: expect.stringMatching(/ok|degraded/),
      environment: {
        name: expect.any(String),
        app_version: expect.any(String),
      },
      services: {
        api: {
          reachable: true,
        },
        database: {
          reachable: expect.any(Boolean),
        },
        notifications: {
          mode: expect.any(String),
          readiness: expect.any(String),
          delivery_enabled: expect.any(Boolean),
        },
      },
      readiness: {
        config_ready: expect.any(Boolean),
        migration_ready: expect.any(Boolean),
        missing_tables: expect.any(Array),
      },
    });
  });
});
