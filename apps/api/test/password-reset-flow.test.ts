import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { PlatformUserRole } from '@prisma/client';

import { createApp } from '../src/app';
import { prisma } from '../src/db/prisma';
import { hashPassword } from '../src/utils/password';

describe('Tenant password reset flows', () => {
  const app = createApp();
  let ipCounter = 10;

  function nextIp() {
    ipCounter += 1;
    return `10.0.0.${ipCounter}`;
  }

  async function platformToken() {
    const email = process.env.PLATFORM_OWNER_EMAIL!;
    const password = process.env.PLATFORM_OWNER_PASSWORD!;
    await prisma.platformUser.upsert({
      where: { email },
      update: { role: PlatformUserRole.PLATFORM_OWNER, passwordHash: await hashPassword(password) },
      create: { email, role: PlatformUserRole.PLATFORM_OWNER, passwordHash: await hashPassword(password) },
    });
    const login = await request(app)
      .post('/auth/platform-login')
      .set('x-forwarded-for', nextIp())
      .send({ email, password });
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
      .set('x-forwarded-for', nextIp())
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

    const response = await request(app)
      .post('/auth/reset-request')
      .set('host', host)
      .set('x-forwarded-for', nextIp())
      .send({ identifier: 'unknown-user' });
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

    const resetRequest = await prisma.passwordResetRequest.findFirst({
      where: {
        tenantId,
        usernameEntered: 'unknown-user',
      },
      orderBy: { requestedAt: 'desc' },
    });
    expect(resetRequest).toBeTruthy();
    expect(resetRequest?.status).toBe('PENDING');
  });

  it('accepts request-password-reset endpoint with the same generic response', async () => {
    const { tenantId, host } = await createTenantWithManager('resetrequestv2');
    const response = await request(app)
      .post('/auth/request-password-reset')
      .set('host', host)
      .set('x-forwarded-for', nextIp())
      .send({ identifier: 'ghost-user' });
    expect(response.status).toBe(202);
    expect(response.body).toEqual({
      accepted: true,
      message: 'Your request has been submitted for review.',
    });

    const resetRequest = await prisma.passwordResetRequest.findFirst({
      where: {
        tenantId,
        usernameEntered: 'ghost-user',
      },
      orderBy: { requestedAt: 'desc' },
    });
    expect(resetRequest).toBeTruthy();
    expect(resetRequest?.status).toBe('PENDING');
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

    const driverLogin = await request(app).post('/auth/login').set('host', host).set('x-forwarded-for', nextIp()).send({
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

    const adminLogin = await request(app).post('/auth/login').set('host', host).set('x-forwarded-for', nextIp()).send({
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
      const relogin = await request(app).post('/auth/login').set('host', host).set('x-forwarded-for', nextIp()).send({
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

  it('allows transport manager to approve/reject password reset requests with audit trail', async () => {
    const { tenantId, host, tmToken } = await createTenantWithManager('resetapproval');

    const site = await request(app)
      .post('/tenanted/master-data/sites')
      .set('host', host)
      .set('authorization', `Bearer ${tmToken}`)
      .send({
        site_code: 'APR-SITE',
        site_name: 'Approve Site',
      });
    expect(site.status).toBe(201);

    const createdDriver = await request(app)
      .post('/tenanted/master-data/drivers')
      .set('host', host)
      .set('authorization', `Bearer ${tmToken}`)
      .send({
        role: 'DRIVER',
        full_name: 'Approval Driver',
        employee_no: 'APR-01',
        username: 'approvaldriver',
        site_id: site.body.id as string,
        is_active: true,
      });
    expect(createdDriver.status).toBe(201);

    const requestResponse = await request(app)
      .post('/auth/request-password-reset')
      .set('host', host)
      .set('x-forwarded-for', nextIp())
      .send({ identifier: 'approvaldriver' });
    expect(requestResponse.status).toBe(202);

    const listResponse = await request(app)
      .get('/tenanted/password-reset-requests?status=PENDING')
      .set('host', host)
      .set('authorization', `Bearer ${tmToken}`);
    expect(listResponse.status).toBe(200);
    const pending = (listResponse.body.items as Array<{ id: string; username_entered: string }>).find(
      (item) => item.username_entered === 'approvaldriver',
    );
    expect(pending).toBeTruthy();

    const approveResponse = await request(app)
      .post(`/tenanted/password-reset-requests/${pending!.id}/approve`)
      .set('host', host)
      .set('authorization', `Bearer ${tmToken}`)
      .send({ notes: 'Pilot support reset' });
    expect(approveResponse.status).toBe(200);
    expect(approveResponse.body.force_password_change).toBe(true);
    expect(typeof approveResponse.body.temporary_password).toBe('string');

    const approvedInDb = await prisma.passwordResetRequest.findUnique({ where: { id: pending!.id } });
    expect(approvedInDb?.status).toBe('APPROVED');

    const authRecord = await prisma.userAuth.findUnique({
      where: { userId: createdDriver.body.id as string },
      select: { forcePasswordChange: true },
    });
    expect(authRecord?.forcePasswordChange).toBe(true);

    const rejectSeed = await request(app)
      .post('/auth/request-password-reset')
      .set('host', host)
      .set('x-forwarded-for', nextIp())
      .send({ identifier: 'approvaldriver' });
    expect(rejectSeed.status).toBe(202);
    const pendingAgain = await prisma.passwordResetRequest.findFirst({
      where: {
        tenantId,
        usernameEntered: 'approvaldriver',
        status: 'PENDING',
      },
      orderBy: { requestedAt: 'desc' },
    });
    expect(pendingAgain).toBeTruthy();

    const rejectResponse = await request(app)
      .post(`/tenanted/password-reset-requests/${pendingAgain!.id}/reject`)
      .set('host', host)
      .set('authorization', `Bearer ${tmToken}`)
      .send({ notes: 'Duplicate request' });
    expect(rejectResponse.status).toBe(200);
    expect(rejectResponse.body.item.status).toBe('REJECTED');

    const rejectAudit = await prisma.auditLog.findFirst({
      where: {
        tenantId,
        eventType: 'PASSWORD_RESET_REQUEST_REJECTED',
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(rejectAudit).toBeTruthy();
  });
});
