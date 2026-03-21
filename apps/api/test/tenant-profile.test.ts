import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { PlatformUserRole } from '@prisma/client';

import { createApp } from '../src/app';
import { prisma } from '../src/db/prisma';
import { hashPassword } from '../src/utils/password';

describe('Tenant self profile', () => {
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

  it('reads and updates authenticated tenant profile', async () => {
    const platform = await platformToken();
    const subdomain = 'selfprofile';

    const created = await request(app)
      .post('/platform/tenants')
      .set('authorization', `Bearer ${platform}`)
      .send({
        tenantName: 'Self Profile Tenant',
        subdomain,
        createInitialAdmin: true,
        initialAdmin: {
          email: 'profile@tenant.test',
          username: 'profileadmin',
          password: 'StrongPass123',
          fullName: 'Profile Admin',
        },
      });
    expect(created.status).toBe(201);

    const login = await request(app)
      .post('/auth/login')
      .set('host', `${subdomain}.platform.test`)
      .send({
        identifier: 'profileadmin',
        password: 'StrongPass123',
      });
    expect(login.status).toBe(200);
    const token = login.body.access_token as string;

    const profile = await request(app)
      .get('/tenanted/profile')
      .set('host', `${subdomain}.platform.test`)
      .set('authorization', `Bearer ${token}`);
    expect(profile.status).toBe(200);
    expect(profile.body.item.username).toBe('profileadmin');

    const updated = await request(app)
      .patch('/tenanted/profile')
      .set('host', `${subdomain}.platform.test`)
      .set('authorization', `Bearer ${token}`)
      .send({
        full_name: 'Profile Admin Updated',
        username: 'profileadmin.updated',
      });
    expect(updated.status).toBe(200);
    expect(updated.body.item.full_name).toBe('Profile Admin Updated');
    expect(updated.body.item.username).toBe('profileadmin.updated');
  });
});
