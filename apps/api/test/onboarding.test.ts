import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { PlatformUserRole } from '@prisma/client';

import { createApp } from '../src/app';
import { prisma } from '../src/db/prisma';
import { hashPassword } from '../src/utils/password';
import { workbookBufferFromFixture } from './helpers/onboarding-workbook';

describe('Company onboarding workbook import', () => {
  const app = createApp();

  async function platformToken() {
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
    return login.body.access_token as string;
  }

  async function createCompany(token: string, subdomain: string, withInitialAdmin = false) {
    const created = await request(app)
      .post('/platform/tenants')
      .set('authorization', `Bearer ${token}`)
      .send({
        tenantName: `Company ${subdomain}`,
        subdomain,
        createInitialAdmin: withInitialAdmin,
        initialAdmin: withInitialAdmin
          ? {
              email: `admin@${subdomain}.test`,
              username: 'owner',
              password: 'StrongPass123',
              fullName: 'Owner User',
            }
          : undefined,
      });

    expect(created.status).toBe(201);
    return created.body.id as string;
  }

  async function createBatch(token: string, companyId: string) {
    const response = await request(app)
      .post('/platform/onboarding/batches')
      .set('authorization', `Bearer ${token}`)
      .send({ company_id: companyId });

    expect(response.status).toBe(201);
    return response.body.id as string;
  }

  it('only platform owner can create/upload/preview/commit', async () => {
    const withoutAuth = await request(app).post('/platform/onboarding/batches').send({
      company_id: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(withoutAuth.status).toBe(401);

    const token = await platformToken();
    const companyId = await createCompany(token, 'authcases');
    const batchId = await createBatch(token, companyId);
    const workbook = workbookBufferFromFixture('onboarding-valid.json');

    const upload = await request(app)
      .post(`/platform/onboarding/batches/${batchId}/upload`)
      .set('authorization', `Bearer ${token}`)
      .attach('file', workbook, 'company.xlsx');
    expect(upload.status).toBe(200);

    const previewNoAuth = await request(app).get(`/platform/onboarding/batches/${batchId}/preview`);
    expect(previewNoAuth.status).toBe(401);

    const commitNoAuth = await request(app).post(`/platform/onboarding/batches/${batchId}/commit`);
    expect(commitNoAuth.status).toBe(401);
  });

  it('preview catches missing required columns', async () => {
    const token = await platformToken();
    const companyId = await createCompany(token, 'missingcolumns');
    const batchId = await createBatch(token, companyId);

    const workbook = workbookBufferFromFixture('onboarding-valid.json', {
      Drivers: [
        {
          Employee_No: 'emp-1',
          Full_Name: 'No Role Driver'
        }
      ]
    });

    await request(app)
      .post(`/platform/onboarding/batches/${batchId}/upload`)
      .set('authorization', `Bearer ${token}`)
      .attach('file', workbook, 'company.xlsx');

    const preview = await request(app)
      .get(`/platform/onboarding/batches/${batchId}/preview`)
      .set('authorization', `Bearer ${token}`);

    expect(preview.status).toBe(400);
    expect(preview.body.error.code).toBe('onboarding_validation_failed');
    expect(preview.body.error.details.preview.summary.errors_count).toBeGreaterThan(0);
    expect(preview.body.error.details.preview.sheets.Drivers.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'Role' })]),
    );
  });

  it('preview catches bad Site_Code references', async () => {
    const token = await platformToken();
    const companyId = await createCompany(token, 'badsite');
    const batchId = await createBatch(token, companyId);

    const workbook = workbookBufferFromFixture('onboarding-valid.json', {
      Vehicles_Cards: [
        {
          Site_Code: 'missing-site',
          Fleet_No: 'f200'
        }
      ]
    });

    await request(app)
      .post(`/platform/onboarding/batches/${batchId}/upload`)
      .set('authorization', `Bearer ${token}`)
      .attach('file', workbook, 'company.xlsx');

    const preview = await request(app)
      .get(`/platform/onboarding/batches/${batchId}/preview`)
      .set('authorization', `Bearer ${token}`);

    expect(preview.status).toBe(400);
    expect(preview.body.error.code).toBe('onboarding_validation_failed');
    expect(preview.body.error.details.preview.sheets.Vehicles_Cards.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'Site_Code' })]),
    );
  });

  it('commit is blocked when preview has errors', async () => {
    const token = await platformToken();
    const companyId = await createCompany(token, 'commitblockedv2');
    const batchId = await createBatch(token, companyId);

    const workbook = workbookBufferFromFixture('onboarding-valid.json', {
      Tanks: [
        {
          Site_Code: 's1',
          Tank_Name: 'Bad Tank',
          Capacity_L: 100,
          Reorder_Level_L: 150
        }
      ]
    });

    await request(app)
      .post(`/platform/onboarding/batches/${batchId}/upload`)
      .set('authorization', `Bearer ${token}`)
      .attach('file', workbook, 'company.xlsx');

    const commit = await request(app)
      .post(`/platform/onboarding/batches/${batchId}/commit`)
      .set('authorization', `Bearer ${token}`);

    expect(commit.status).toBe(400);
    expect(commit.body.error.code).toBe('onboarding_validation_failed');
  });

  it('commit creates expected company records from workbook', async () => {
    const token = await platformToken();
    const companyId = await createCompany(token, 'commitgood', true);
    const batchId = await createBatch(token, companyId);
    const workbook = workbookBufferFromFixture('onboarding-valid.json');

    await request(app)
      .post(`/platform/onboarding/batches/${batchId}/upload`)
      .set('authorization', `Bearer ${token}`)
      .attach('file', workbook, 'company.xlsx');

    const preview = await request(app)
      .get(`/platform/onboarding/batches/${batchId}/preview`)
      .set('authorization', `Bearer ${token}`);
    expect(preview.status).toBe(200);
    expect(preview.body.summary.errors_count).toBe(0);

    const commit = await request(app)
      .post(`/platform/onboarding/batches/${batchId}/commit`)
      .set('authorization', `Bearer ${token}`);
    expect(commit.status).toBe(200);

    const tenantLogin = await request(app)
      .post('/auth/login')
      .set('host', 'commitgood.platform.test')
      .send({
        identifier: 'owner',
        password: 'StrongPass123',
      });
    expect(tenantLogin.status).toBe(200);

    const summary = await request(app)
      .get('/tenanted/dashboard/summary')
      .set('host', 'commitgood.platform.test')
      .set('authorization', `Bearer ${tenantLogin.body.access_token}`);
    expect(summary.status).toBe(200);
    expect(summary.body.kpis.sites_total).toBeGreaterThan(0);
    expect(summary.body.kpis.vehicles_total).toBeGreaterThan(0);
    expect(summary.body.kpis.drivers_total).toBeGreaterThan(0);
    expect(summary.body.kpis.fuel_cards_total).toBeGreaterThan(0);
    expect(summary.body.onboarding.last_batch).not.toBeNull();

    const [sites, users, vehicles, cards, tanks] = await Promise.all([
      prisma.site.count({ where: { tenantId: companyId } }),
      prisma.user.count({ where: { tenantId: companyId } }),
      prisma.vehicle.count({ where: { tenantId: companyId } }),
      prisma.fuelCard.count({ where: { tenantId: companyId } }),
      prisma.tank.count({ where: { tenantId: companyId } }),
    ]);

    expect(sites).toBe(1);
    expect(users).toBe(2);
    expect(vehicles).toBe(1);
    expect(cards).toBe(1);
    expect(tanks).toBe(1);
  });
});
