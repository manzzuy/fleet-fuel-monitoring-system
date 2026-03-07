import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { DailyCheckStatus, PlatformUserRole, UserRole } from '@prisma/client';

import { createApp } from '../src/app';
import { prisma } from '../src/db/prisma';
import { hashPassword } from '../src/utils/password';

const TODAY = new Date().toISOString().slice(0, 10);

describe('Daily checks monitoring filters and signals', () => {
  const app = createApp();

  async function createPlatformOwner() {
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
    expect(login.status).toBe(200);
    return login.body.access_token as string;
  }

  async function createTenantWithAdmin(
    platformToken: string,
    subdomain: string,
    username: string,
  ): Promise<{ tenantId: string; token: string }> {
    const created = await request(app)
      .post('/platform/tenants')
      .set('authorization', `Bearer ${platformToken}`)
      .send({
        tenantName: `Tenant ${subdomain}`,
        subdomain,
        createInitialAdmin: true,
        initialAdmin: {
          email: `${username}@${subdomain}.test`,
          username,
          password: 'StrongPass123',
          fullName: `${username} Admin`,
        },
      });

    expect(created.status).toBe(201);

    const login = await request(app)
      .post('/auth/login')
      .set('host', `${subdomain}.platform.test`)
      .send({
        identifier: username,
        password: 'StrongPass123',
      });

    expect(login.status).toBe(200);

    return {
      tenantId: created.body.id as string,
      token: login.body.access_token as string,
    };
  }

  it('supports issue-only, critical-only, and repeated issue filters', async () => {
    const platformToken = await createPlatformOwner();
    const tenant = await createTenantWithAdmin(platformToken, 'dailychecksmonitor', 'dailymonitoradmin');

    const site = await prisma.site.create({
      data: {
        tenantId: tenant.tenantId,
        siteCode: 'SITE-01',
        siteName: 'Main Site',
      },
    });

    const [vehicleIssue, vehicleClear] = await Promise.all([
      prisma.vehicle.create({
        data: {
          tenantId: tenant.tenantId,
          fleetNumber: 'ISSUE-001',
          plateNumber: 'ISSUE-001',
          siteId: site.id,
        },
      }),
      prisma.vehicle.create({
        data: {
          tenantId: tenant.tenantId,
          fleetNumber: 'CLEAR-001',
          plateNumber: 'CLEAR-001',
          siteId: site.id,
        },
      }),
    ]);

    const driver = await prisma.user.create({
      data: {
        tenantId: tenant.tenantId,
        role: UserRole.DRIVER,
        username: 'driver-monitor',
        employeeNo: 'EMP-MONITOR',
        fullName: 'Driver Monitor',
        passwordHash: await hashPassword('DriverPass123'),
      },
    });

    const checklistItem =
      (await prisma.checklistItemMaster.findFirst({
        where: { isActive: true, requiredItem: true },
        select: { itemCode: true },
      })) ??
      (await prisma.checklistItemMaster.findFirst({
        where: { isActive: true },
        select: { itemCode: true },
      }));
    expect(checklistItem).not.toBeNull();

    const todayDate = new Date(`${TODAY}T00:00:00.000Z`);
    const yesterdayDate = new Date(todayDate);
    yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
    const twoDaysAgoDate = new Date(todayDate);
    twoDaysAgoDate.setUTCDate(twoDaysAgoDate.getUTCDate() - 2);

    const issueToday = await prisma.dailyCheck.create({
      data: {
        tenantId: tenant.tenantId,
        siteId: site.id,
        vehicleId: vehicleIssue.id,
        driverId: driver.id,
        checkDate: todayDate,
        status: DailyCheckStatus.SUBMITTED,
      },
    });
    await prisma.dailyCheckItem.create({
      data: {
        dailyCheckId: issueToday.id,
        itemCode: checklistItem!.itemCode,
        status: 'NOT_OK',
      },
    });

    const issueYesterday = await prisma.dailyCheck.create({
      data: {
        tenantId: tenant.tenantId,
        siteId: site.id,
        vehicleId: vehicleIssue.id,
        driverId: driver.id,
        checkDate: yesterdayDate,
        status: DailyCheckStatus.SUBMITTED,
      },
    });
    await prisma.dailyCheckItem.create({
      data: {
        dailyCheckId: issueYesterday.id,
        itemCode: checklistItem!.itemCode,
        status: 'NOT_OK',
      },
    });

    const clearToday = await prisma.dailyCheck.create({
      data: {
        tenantId: tenant.tenantId,
        siteId: site.id,
        vehicleId: vehicleClear.id,
        driverId: driver.id,
        checkDate: todayDate,
        status: DailyCheckStatus.SUBMITTED,
      },
    });
    await prisma.dailyCheckItem.create({
      data: {
        dailyCheckId: clearToday.id,
        itemCode: checklistItem!.itemCode,
        status: 'OK',
      },
    });

    await prisma.dailyCheck.create({
      data: {
        tenantId: tenant.tenantId,
        siteId: site.id,
        vehicleId: vehicleClear.id,
        driverId: driver.id,
        checkDate: twoDaysAgoDate,
        status: DailyCheckStatus.DRAFT,
      },
    });

    const issueOnly = await request(app)
      .get('/tenanted/daily-checks')
      .query({ date: TODAY, issue_only: true })
      .set('host', 'dailychecksmonitor.platform.test')
      .set('authorization', `Bearer ${tenant.token}`);

    expect(issueOnly.status).toBe(200);
    expect(issueOnly.body.items.length).toBe(1);
    expect(issueOnly.body.items[0].id).toBe(issueToday.id);

    const criticalOnly = await request(app)
      .get('/tenanted/daily-checks')
      .query({ date: TODAY, critical_only: true })
      .set('host', 'dailychecksmonitor.platform.test')
      .set('authorization', `Bearer ${tenant.token}`);

    expect(criticalOnly.status).toBe(200);
    expect(criticalOnly.body.items.length).toBe(1);
    expect(criticalOnly.body.items[0].id).toBe(issueToday.id);

    const repeatedOnly = await request(app)
      .get('/tenanted/daily-checks')
      .query({ date: TODAY, issue_only: true, repeated_vehicle_only: true })
      .set('host', 'dailychecksmonitor.platform.test')
      .set('authorization', `Bearer ${tenant.token}`);

    expect(repeatedOnly.status).toBe(200);
    expect(repeatedOnly.body.items.length).toBe(1);
    expect(repeatedOnly.body.items[0].id).toBe(issueToday.id);
    expect(repeatedOnly.body.items[0].signals.vehicle_has_repeated_issues).toBe(true);
    expect(repeatedOnly.body.items[0].signals.repeated_issue_count_7d).toBeGreaterThanOrEqual(2);
    expect(repeatedOnly.body.items[0].signals.driver_draft_count_7d).toBeGreaterThanOrEqual(1);

    const skipOnly = await request(app)
      .get('/tenanted/daily-checks')
      .query({ from: TODAY, to: TODAY, skip_only: true, driver_id: driver.id })
      .set('host', 'dailychecksmonitor.platform.test')
      .set('authorization', `Bearer ${tenant.token}`);

    expect(skipOnly.status).toBe(200);
    expect(skipOnly.body.items.length).toBe(0);

    const skipOnlyRange = await request(app)
      .get('/tenanted/daily-checks')
      .query({ from: twoDaysAgoDate.toISOString().slice(0, 10), to: TODAY, skip_only: true, driver_id: driver.id })
      .set('host', 'dailychecksmonitor.platform.test')
      .set('authorization', `Bearer ${tenant.token}`);

    expect(skipOnlyRange.status).toBe(200);
    expect(skipOnlyRange.body.items.length).toBe(1);
    expect(skipOnlyRange.body.items[0].status).toBe('DRAFT');

    const bySite = await request(app)
      .get('/tenanted/daily-checks')
      .query({ date: TODAY, site_id: site.id })
      .set('host', 'dailychecksmonitor.platform.test')
      .set('authorization', `Bearer ${tenant.token}`);

    expect(bySite.status).toBe(200);
    expect(bySite.body.items.length).toBe(2);

    const exactRecord = await request(app)
      .get('/tenanted/daily-checks')
      .query({ related_record_id: issueToday.id })
      .set('host', 'dailychecksmonitor.platform.test')
      .set('authorization', `Bearer ${tenant.token}`);

    expect(exactRecord.status).toBe(200);
    expect(exactRecord.body.items.length).toBe(1);
    expect(exactRecord.body.items[0].id).toBe(issueToday.id);
  });
});
