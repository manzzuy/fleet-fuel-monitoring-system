import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { PlatformUserRole } from '@prisma/client';

import { createApp } from '../src/app';
import { prisma } from '../src/db/prisma';
import { hashPassword } from '../src/utils/password';

describe('Forced password change flow', () => {
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

  it('requires changing password before accessing protected routes', async () => {
    const platform = await platformToken();
    const subdomain = 'forcepwdcase';

    const created = await request(app)
      .post('/platform/tenants')
      .set('authorization', `Bearer ${platform}`)
      .send({
        tenantName: 'Force Password Tenant',
        subdomain,
        createInitialAdmin: true,
        initialAdmin: {
          email: 'force@tenant.test',
          username: 'forceadmin',
          password: 'StrongPass123',
          fullName: 'Force Admin',
        },
      });
    expect(created.status).toBe(201);
    const tenantId = created.body.id as string;

    const adminUser = await prisma.user.findFirst({
      where: { tenantId, username: 'forceadmin' },
      select: { id: true },
    });
    expect(adminUser?.id).toBeTruthy();

    await prisma.userAuth.upsert({
      where: { userId: adminUser!.id },
      update: { forcePasswordChange: true },
      create: {
        userId: adminUser!.id,
        passwordHash: await hashPassword('StrongPass123'),
        forcePasswordChange: true,
      },
    });

    const login = await request(app)
      .post('/auth/login')
      .set('host', `${subdomain}.platform.test`)
      .send({
        identifier: 'forceadmin',
        password: 'StrongPass123',
      });
    expect(login.status).toBe(200);
    expect(login.body.force_password_change).toBe(true);

    const blocked = await request(app)
      .get('/tenanted/dashboard/summary')
      .set('host', `${subdomain}.platform.test`)
      .set('authorization', `Bearer ${login.body.access_token}`);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error?.code).toBe('password_change_required');

    const changed = await request(app)
      .post('/auth/change-password')
      .set('host', `${subdomain}.platform.test`)
      .set('authorization', `Bearer ${login.body.access_token}`)
      .send({
        current_password: 'StrongPass123',
        new_password: 'NewStrongPass123',
      });
    expect(changed.status).toBe(200);
    expect(changed.body.force_password_change).toBe(false);

    const allowed = await request(app)
      .get('/tenanted/dashboard/summary')
      .set('host', `${subdomain}.platform.test`)
      .set('authorization', `Bearer ${changed.body.access_token}`);
    expect(allowed.status).toBe(200);
  });
});
