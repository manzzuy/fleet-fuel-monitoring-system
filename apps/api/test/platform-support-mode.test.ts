import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { PlatformUserRole } from '@prisma/client';

import { createApp } from '../src/app';
import { prisma } from '../src/db/prisma';
import { hashPassword } from '../src/utils/password';

describe('Platform support mode override', () => {
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

  async function seedTenant(accessToken: string, subdomain: string) {
    const created = await request(app)
      .post('/platform/tenants')
      .set('authorization', `Bearer ${accessToken}`)
      .send({
        tenantName: `Support ${subdomain}`,
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
    return created.body.id as string;
  }

  it('requires support mode token for support endpoints', async () => {
    const token = await platformToken();
    const tenantId = await seedTenant(token, 'supportguard');

    const denied = await request(app)
      .get(`/platform/support/tenants/${tenantId}/users`)
      .set('authorization', `Bearer ${token}`);

    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('support_mode_required');
  });

  it('enters support mode and lists tenant users', async () => {
    const token = await platformToken();
    const tenantId = await seedTenant(token, 'supportlist');

    const supportMode = await request(app)
      .post('/platform/support-mode/enter')
      .set('authorization', `Bearer ${token}`)
      .send({});

    expect(supportMode.status).toBe(200);
    expect(supportMode.body.support_mode).toBe(true);

    const listed = await request(app)
      .get(`/platform/support/tenants/${tenantId}/users`)
      .set('authorization', `Bearer ${supportMode.body.access_token as string}`);

    expect(listed.status).toBe(200);
    expect(Array.isArray(listed.body.items)).toBe(true);
    expect(listed.body.items.length).toBeGreaterThan(0);
    expect(listed.body.items[0]).toMatchObject({
      tenant_id: tenantId,
    });

    const auditCount = await prisma.auditLog.count({
      where: {
        eventType: 'PLATFORM_SUPPORT_MODE_ENTERED',
      },
    });
    expect(auditCount).toBeGreaterThan(0);
  });

  it('updates and resets a tenant user with audit entries', async () => {
    const token = await platformToken();
    const tenantId = await seedTenant(token, 'supportupdate');

    const supportMode = await request(app)
      .post('/platform/support-mode/enter')
      .set('authorization', `Bearer ${token}`)
      .send({});

    const supportToken = supportMode.body.access_token as string;
    const users = await request(app)
      .get(`/platform/support/tenants/${tenantId}/users`)
      .set('authorization', `Bearer ${supportToken}`);
    expect(users.status).toBe(200);

    const target = users.body.items.find((item: { role: string }) => item.role === 'TRANSPORT_MANAGER');
    expect(target).toBeTruthy();

    const patched = await request(app)
      .patch(`/platform/support/tenants/${tenantId}/users/${target.id as string}`)
      .set('authorization', `Bearer ${supportToken}`)
      .send({
        full_name: 'Support Managed TM',
      });

    expect(patched.status).toBe(200);
    expect(patched.body.item.full_name).toBe('Support Managed TM');

    const reset = await request(app)
      .post(`/platform/support/tenants/${tenantId}/users/${target.id as string}/reset-account`)
      .set('authorization', `Bearer ${supportToken}`)
      .send({
        password: 'SupportReset123',
      });

    expect(reset.status).toBe(200);
    expect(reset.body.password_reset).toBe(true);

    const [updatedAudit, resetAudit] = await Promise.all([
      prisma.auditLog.count({
        where: {
          tenantId,
          eventType: 'PLATFORM_SUPPORT_USER_UPDATED',
          metadata: {
            path: ['user_id'],
            equals: target.id,
          },
        },
      }),
      prisma.auditLog.count({
        where: {
          tenantId,
          eventType: 'PLATFORM_SUPPORT_ACCOUNT_RESET',
          metadata: {
            path: ['user_id'],
            equals: target.id,
          },
        },
      }),
    ]);

    expect(updatedAudit).toBeGreaterThan(0);
    expect(resetAudit).toBeGreaterThan(0);
  });
});
