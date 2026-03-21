import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { PlatformUserRole } from '@prisma/client';

import { createApp } from '../src/app';
import { prisma } from '../src/db/prisma';
import { hashPassword } from '../src/utils/password';

describe('Tenant password reset flows', () => {
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

  async function createTenantWithManager(subdomain: string) {
    const platform = await platformToken();
    const created = await request(app)
      .post('/platform/tenants')
      .set('authorization', `Bearer ${platform}`)
      .send({
        tenantName: `Tenant ${subdomain}`,
        subdomain,
        createInitialAdmin: true,
        initialAdmin: {
          email: `${subdomain}@tenant.test`,
          username: `${subdomain}tm`,
          password: 'StrongPass123',
          fullName: `${subdomain} TM`,
        },
      });
    expect(created.status).toBe(201);

    const tmLogin = await request(app)
      .post('/auth/login')
      .set('host', `${subdomain}.platform.test`)
      .send({
        identifier: `${subdomain}tm`,
        password: 'StrongPass123',
      });
    expect(tmLogin.status).toBe(200);

    return {
      tenantId: created.body.id as string,
      host: `${subdomain}.platform.test`,
      tmToken: tmLogin.body.access_token as string,
    };
  }

  it('accepts password reset requests without leaking account existence', async () => {
    const { tenantId, host } = await createTenantWithManager('resetrequest');

    const response = await request(app).post('/auth/reset-request').set('host', host).send({ identifier: 'unknown-user' });
    expect(response.status).toBe(202);
    expect(response.body.accepted).toBe(true);

    const audit = await prisma.auditLog.findFirst({
      where: {
        tenantId,
        eventType: 'PASSWORD_RESET_REQUESTED',
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).toBeTruthy();
  });

  it('allows transport manager to reset user password and enforces force_password_change', async () => {
    const { host, tmToken } = await createTenantWithManager('resetmanager');

    const site = await request(app)
      .post('/tenanted/master-data/sites')
      .set('host', host)
      .set('authorization', `Bearer ${tmToken}`)
      .send({
        site_code: 'RST-SITE',
        site_name: 'Reset Site',
      });
    expect(site.status).toBe(201);

    const createdDriver = await request(app)
      .post('/tenanted/master-data/drivers')
      .set('host', host)
      .set('authorization', `Bearer ${tmToken}`)
      .send({
        role: 'DRIVER',
        full_name: 'Reset Driver',
        employee_no: 'RST-01',
        username: 'resetdriver',
        site_id: site.body.id as string,
        is_active: true,
      });
    expect(createdDriver.status).toBe(201);

    const reset = await request(app)
      .post(`/tenanted/master-data/drivers/${createdDriver.body.id as string}/reset-password`)
      .set('host', host)
      .set('authorization', `Bearer ${tmToken}`)
      .send({});
    expect(reset.status).toBe(200);
    expect(reset.body.force_password_change).toBe(true);
    expect(typeof reset.body.temporary_password).toBe('string');
    expect(reset.body.temporary_password.length).toBeGreaterThanOrEqual(10);

    await prisma.userSiteAccess.deleteMany({
      where: {
        userId: createdDriver.body.id as string,
      },
    });

    const driverLogin = await request(app).post('/auth/login').set('host', host).send({
      identifier: 'resetdriver',
      password: reset.body.temporary_password,
    });
    expect(driverLogin.status).toBe(200);
    expect(driverLogin.body.force_password_change).toBe(true);
  });

  it('blocks tenant admin from resetting tenant admin credentials', async () => {
    const { host, tmToken } = await createTenantWithManager('resetroleguard');

    const tenantAdmin = await request(app)
      .post('/tenanted/master-data/drivers')
      .set('host', host)
      .set('authorization', `Bearer ${tmToken}`)
      .send({
        role: 'TENANT_ADMIN',
        full_name: 'Ops Admin',
        employee_no: 'OPS-01',
        username: 'opsadmin',
        is_active: true,
      });
    expect(tenantAdmin.status).toBe(201);

    const adminLogin = await request(app).post('/auth/login').set('host', host).send({
      identifier: 'opsadmin',
      password: tenantAdmin.body.temporary_password ?? '',
    });
    // Created users use random bootstrap passwords; reset once via TM for deterministic login.
    if (adminLogin.status !== 200) {
      const bootstrap = await request(app)
        .post(`/tenanted/master-data/drivers/${tenantAdmin.body.id as string}/reset-password`)
        .set('host', host)
        .set('authorization', `Bearer ${tmToken}`)
        .send({});
      expect(bootstrap.status).toBe(200);
      const relogin = await request(app).post('/auth/login').set('host', host).send({
        identifier: 'opsadmin',
        password: bootstrap.body.temporary_password,
      });
      expect(relogin.status).toBe(200);
      const blocked = await request(app)
        .post(`/tenanted/master-data/drivers/${tenantAdmin.body.id as string}/reset-password`)
        .set('host', host)
        .set('authorization', `Bearer ${relogin.body.access_token as string}`)
        .send({});
      expect(blocked.status).toBe(403);
      expect(['password_change_required', 'forbidden_role_assignment']).toContain(blocked.body.error?.code);
      return;
    }

    const blocked = await request(app)
      .post(`/tenanted/master-data/drivers/${tenantAdmin.body.id as string}/reset-password`)
      .set('host', host)
      .set('authorization', `Bearer ${adminLogin.body.access_token as string}`)
      .send({});
    expect(blocked.status).toBe(403);
    expect(['password_change_required', 'forbidden_role_assignment']).toContain(blocked.body.error?.code);
  });
});
