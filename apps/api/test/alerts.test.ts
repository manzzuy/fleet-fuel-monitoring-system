import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { DailyCheckStatus, PlatformUserRole, Prisma, UserRole } from '@prisma/client';

import { createApp } from '../src/app';
import { prisma } from '../src/db/prisma';
import { hashPassword } from '../src/utils/password';

const now = new Date();
const TEST_DATE = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

describe('Dashboard alerts endpoint', () => {
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

  it('returns empty alert state for a tenant with no operational rows', async () => {
    const platformToken = await createPlatformOwner();
    const tenant = await createTenantWithAdmin(platformToken, 'alertsempty', 'alertemptyadmin');

    const response = await request(app)
      .get('/tenanted/dashboard/alerts')
      .query({ date: TEST_DATE })
      .set('host', 'alertsempty.platform.test')
      .set('authorization', `Bearer ${tenant.token}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      tenant: {
        id: tenant.tenantId,
        subdomain: 'alertsempty',
      },
      summary: {
        date: TEST_DATE,
        vehicles_missing_daily_check: 0,
        checklist_issues_today: 0,
        fuel_entries_today: 0,
        high_priority_exceptions: 0,
        total_alerts: 0,
      },
      items: [],
      request_id: expect.any(String),
    });
  });

  it('generates all core rule-based alert types and supports filtering', async () => {
    const platformToken = await createPlatformOwner();
    const tenant = await createTenantWithAdmin(platformToken, 'alertsfull', 'alertfulladmin');

    const site = await prisma.site.create({
      data: {
        tenantId: tenant.tenantId,
        siteCode: 'MAIN',
        siteName: 'Main Yard',
      },
    });

    const [vehicleMissing, vehicleIssue, vehicleFuel] = await Promise.all([
      prisma.vehicle.create({
        data: {
          tenantId: tenant.tenantId,
          fleetNumber: 'MISS-001',
          plateNumber: 'MISS-001',
          siteId: site.id,
        },
      }),
      prisma.vehicle.create({
        data: {
          tenantId: tenant.tenantId,
          fleetNumber: 'CHK-001',
          plateNumber: 'CHK-001',
          siteId: site.id,
        },
      }),
      prisma.vehicle.create({
        data: {
          tenantId: tenant.tenantId,
          fleetNumber: 'FUEL-001',
          plateNumber: 'FUEL-001',
          siteId: site.id,
        },
      }),
    ]);

    const driver = await prisma.user.create({
      data: {
        tenantId: tenant.tenantId,
        role: UserRole.DRIVER,
        username: 'driver-alerts',
        employeeNo: 'EMP-ALERTS',
        fullName: 'Driver Alerts',
        passwordHash: await hashPassword('DriverPass123'),
      },
    });

    const firstChecklistItem =
      (await prisma.checklistItemMaster.findFirst({
        where: { isActive: true, requiredItem: true },
        orderBy: { itemCode: 'asc' },
        select: { itemCode: true },
      })) ??
      (await prisma.checklistItemMaster.findFirst({
        where: { isActive: true },
        orderBy: { itemCode: 'asc' },
        select: { itemCode: true },
      }));
    expect(firstChecklistItem).not.toBeNull();

    const dailyCheck = await prisma.dailyCheck.create({
      data: {
        tenantId: tenant.tenantId,
        siteId: site.id,
        vehicleId: vehicleIssue.id,
        driverId: driver.id,
        checkDate: new Date(`${TEST_DATE}T00:00:00.000Z`),
        status: DailyCheckStatus.SUBMITTED,
      },
    });

    await prisma.dailyCheckItem.create({
      data: {
        dailyCheckId: dailyCheck.id,
        itemCode: firstChecklistItem!.itemCode,
        status: 'NOT_OK',
      },
    });

    const previousIssueDate = new Date(`${TEST_DATE}T00:00:00.000Z`);
    previousIssueDate.setUTCDate(previousIssueDate.getUTCDate() - 1);
    const dailyCheckPrevious = await prisma.dailyCheck.create({
      data: {
        tenantId: tenant.tenantId,
        siteId: site.id,
        vehicleId: vehicleIssue.id,
        driverId: driver.id,
        checkDate: previousIssueDate,
        status: DailyCheckStatus.SUBMITTED,
      },
    });
    await prisma.dailyCheckItem.create({
      data: {
        dailyCheckId: dailyCheckPrevious.id,
        itemCode: firstChecklistItem!.itemCode,
        status: 'NOT_OK',
      },
    });

    const draftDays = [2, 3, 4];
    for (const dayOffset of draftDays) {
      const draftDate = new Date(`${TEST_DATE}T00:00:00.000Z`);
      draftDate.setUTCDate(draftDate.getUTCDate() - dayOffset);
      await prisma.dailyCheck.create({
        data: {
          tenantId: tenant.tenantId,
          siteId: site.id,
          vehicleId: vehicleFuel.id,
          driverId: driver.id,
          checkDate: draftDate,
          status: DailyCheckStatus.DRAFT,
        },
      });
    }

    await prisma.fuelEntry.createMany({
      data: [
        {
          tenantId: tenant.tenantId,
          siteId: site.id,
          vehicleId: vehicleFuel.id,
          driverId: driver.id,
          entryDate: new Date(`${TEST_DATE}T00:00:00.000Z`),
          liters: new Prisma.Decimal(20),
          sourceType: 'STATION',
          fuelStationId: 'Station-A',
          odometerKm: 10000,
          createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        },
        {
          tenantId: tenant.tenantId,
          siteId: site.id,
          vehicleId: vehicleFuel.id,
          driverId: driver.id,
          entryDate: new Date(`${TEST_DATE}T00:00:00.000Z`),
          liters: new Prisma.Decimal(22),
          sourceType: 'STATION',
          fuelStationId: 'Station-B',
          odometerKm: 10400,
          createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
        },
        {
          tenantId: tenant.tenantId,
          siteId: site.id,
          vehicleId: vehicleFuel.id,
          driverId: driver.id,
          entryDate: new Date(`${TEST_DATE}T00:00:00.000Z`),
          liters: new Prisma.Decimal(21),
          sourceType: 'STATION',
          fuelStationId: 'Station-C',
          odometerKm: 10800,
          createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        },
      ],
    });

    const [repeatFirst, repeatSecond, approvedSourceEntry, highLitersEntry] = await Promise.all([
      prisma.fuelEntry.create({
        data: {
          tenantId: tenant.tenantId,
          siteId: site.id,
          vehicleId: vehicleFuel.id,
          driverId: driver.id,
          entryDate: new Date(`${TEST_DATE}T00:00:00.000Z`),
          liters: new Prisma.Decimal(26),
          sourceType: 'CARD',
          odometerKm: 11100,
          fuelCardId: null,
          createdAt: new Date(Date.now() - 35 * 60 * 1000),
        },
      }),
      prisma.fuelEntry.create({
        data: {
          tenantId: tenant.tenantId,
          siteId: site.id,
          vehicleId: vehicleFuel.id,
          driverId: driver.id,
          entryDate: new Date(`${TEST_DATE}T00:00:00.000Z`),
          liters: new Prisma.Decimal(27),
          sourceType: 'CARD',
          odometerKm: 11200,
          createdAt: new Date(Date.now() - 25 * 60 * 1000),
        },
      }),
      prisma.fuelEntry.create({
        data: {
          tenantId: tenant.tenantId,
          siteId: site.id,
          vehicleId: vehicleFuel.id,
          driverId: driver.id,
          entryDate: new Date(`${TEST_DATE}T00:00:00.000Z`),
          liters: new Prisma.Decimal(29),
          sourceType: 'APPROVED_SOURCE',
          approvedSourceContext: 'Remote station fallback',
          odometerFallbackUsed: true,
          odometerFallbackReason: 'Odometer not readable due to glare',
          createdAt: new Date(Date.now() - 15 * 60 * 1000),
        },
      }),
      prisma.fuelEntry.create({
        data: {
          tenantId: tenant.tenantId,
          siteId: site.id,
          vehicleId: vehicleFuel.id,
          driverId: driver.id,
          entryDate: new Date(`${TEST_DATE}T00:00:00.000Z`),
          liters: new Prisma.Decimal(180),
          sourceType: 'STATION',
          fuelStationId: 'Station-D',
          odometerKm: 11400,
          createdAt: new Date(Date.now() - 5 * 60 * 1000),
        },
      }),
    ]);

    const response = await request(app)
      .get('/tenanted/dashboard/alerts')
      .query({ date: TEST_DATE })
      .set('host', 'alertsfull.platform.test')
      .set('authorization', `Bearer ${tenant.token}`);

    expect(response.status).toBe(200);
    expect(response.body.summary.date).toBe(TEST_DATE);
    expect(response.body.summary.vehicles_missing_daily_check).toBeGreaterThanOrEqual(1);
    expect(response.body.summary.checklist_issues_today).toBeGreaterThanOrEqual(1);
    expect(response.body.summary.fuel_entries_today).toBeGreaterThanOrEqual(4);
    expect(response.body.summary.high_priority_exceptions).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(response.body.items)).toBe(true);

    const alertTypes = new Set<string>(response.body.items.map((row: { alert_type: string }) => row.alert_type));
    expect(alertTypes.has('missing_daily_check')).toBe(true);
    expect(alertTypes.has('checklist_issue_reported')).toBe(true);
    expect(alertTypes.has('critical_checklist_issue')).toBe(true);
    expect(alertTypes.has('repeated_checklist_issues_vehicle')).toBe(true);
    expect(alertTypes.has('driver_frequent_skips')).toBe(true);
    expect(alertTypes.has('fuel_missing_receipt')).toBe(true);
    expect(alertTypes.has('fuel_used_odometer_fallback')).toBe(true);
    expect(alertTypes.has('fuel_used_approved_source')).toBe(true);
    expect(alertTypes.has('suspicious_high_liters')).toBe(true);
    expect(alertTypes.has('fueling_too_soon_after_previous_fill')).toBe(true);
    expect(alertTypes.has('suspicious_high_liters_vs_distance')).toBe(true);
    expect(alertTypes.has('suspicious_consumption_deviation')).toBe(true);
    expect(alertTypes.has('suspicious_high_risk_combination')).toBe(true);

    const byType = new Map<string, { action: { target: string }; reason: string }>();
    for (const item of response.body.items as Array<{ alert_type: string; action: { target: string }; reason: string }>) {
      if (!byType.has(item.alert_type)) {
        byType.set(item.alert_type, item);
      }
    }

    expect(byType.get('missing_daily_check')?.action.target).toContain('/daily-checks?');
    expect(byType.get('missing_daily_check')?.action.target).toContain('skip_only=true');

    expect(byType.get('checklist_issue_reported')?.action.target).toContain('/daily-checks/');
    expect(byType.get('checklist_issue_reported')?.action.target).toContain('issue_only=true');

    expect(byType.get('critical_checklist_issue')?.action.target).toContain('/daily-checks/');
    expect(byType.get('critical_checklist_issue')?.action.target).toContain('critical_only=true');

    expect(byType.get('repeated_checklist_issues_vehicle')?.action.target).toContain('/daily-checks?');
    expect(byType.get('repeated_checklist_issues_vehicle')?.action.target).toContain('repeated_vehicle_only=true');

    expect(byType.get('driver_frequent_skips')?.action.target).toContain('/daily-checks?');
    expect(byType.get('driver_frequent_skips')?.action.target).toContain('skip_only=true');

    const fuelActionAlerts = response.body.items.filter(
      (item: { alert_type: string }) =>
        ![
          'missing_daily_check',
          'checklist_issue_reported',
          'critical_checklist_issue',
          'repeated_checklist_issues_vehicle',
          'driver_frequent_skips',
        ].includes(item.alert_type),
    );
    expect(
      fuelActionAlerts.every(
        (item: { action: { target: string } }) =>
          item.action.target.includes('/fuel?') && item.action.target.includes('related_record_id='),
      ),
    ).toBe(true);
    expect(byType.get('fuel_missing_receipt')?.action.target).toContain('missing_receipt_only=true');
    expect(byType.get('fuel_used_odometer_fallback')?.action.target).toContain('fallback_used=true');
    expect(byType.get('fuel_used_approved_source')?.action.target).toContain('source_type=APPROVED_SOURCE');
    expect(byType.get('fueling_too_soon_after_previous_fill')?.reason).toContain('Needs review: fueling too soon');
    expect(byType.get('suspicious_high_liters_vs_distance')?.reason).toContain('higher than expected');
    expect(byType.get('suspicious_consumption_deviation')?.reason).toContain('Actual');
    expect(byType.get('suspicious_high_risk_combination')?.reason).toContain('score');
    const deviationAlert = response.body.items.find(
      (item: { alert_type: string }) => item.alert_type === 'suspicious_consumption_deviation',
    );
    expect(deviationAlert?.anomaly_details?.distance_km).toBeTypeOf('number');
    expect(deviationAlert?.anomaly_details?.expected_liters).toBeTypeOf('number');
    expect(deviationAlert?.anomaly_details?.actual_liters).toBeTypeOf('number');
    expect(deviationAlert?.anomaly_details?.deviation_pct).toBeTypeOf('number');

    const filtered = await request(app)
      .get('/tenanted/dashboard/alerts')
      .query({
        date: TEST_DATE,
        severity: 'HIGH',
        alert_type: 'suspicious_high_liters',
        vehicle_id: vehicleFuel.id,
      })
      .set('host', 'alertsfull.platform.test')
      .set('authorization', `Bearer ${tenant.token}`);

    expect(filtered.status).toBe(200);
    expect(filtered.body.items.length).toBeGreaterThan(0);
    expect(filtered.body.items.every((item: { severity: string }) => item.severity === 'HIGH')).toBe(true);
    expect(
      filtered.body.items.every((item: { alert_type: string }) => item.alert_type === 'suspicious_high_liters'),
    ).toBe(true);
    expect(filtered.body.items.some((item: { related_record_id: string }) => item.related_record_id === highLitersEntry.id)).toBe(
      true,
    );
    expect(
      filtered.body.items.some((item: { related_record_id: string }) => item.related_record_id === repeatSecond.id),
    ).toBe(false);

    // Confirm seeded records remain referenced by generated alerts.
    expect(
      response.body.items.some((item: { related_record_id: string }) => item.related_record_id === dailyCheck.id),
    ).toBe(true);
    expect(
      response.body.items.some((item: { related_record_id: string }) => item.related_record_id === approvedSourceEntry.id),
    ).toBe(true);
    expect(
      response.body.items.some((item: { related_record_id: string }) => item.related_record_id === vehicleMissing.id),
    ).toBe(true);
  });

  it('skips expected-vs-actual anomaly rules when baseline is insufficient or distance is too low', async () => {
    const platformToken = await createPlatformOwner();
    const tenant = await createTenantWithAdmin(platformToken, 'alertsbaselineguard', 'alertsbaselineguardadmin');

    const site = await prisma.site.create({
      data: {
        tenantId: tenant.tenantId,
        siteCode: 'BASE',
        siteName: 'Baseline Guard Site',
      },
    });

    const vehicle = await prisma.vehicle.create({
      data: {
        tenantId: tenant.tenantId,
        fleetNumber: 'BASE-001',
        plateNumber: 'BASE-001',
        siteId: site.id,
      },
    });

    const driver = await prisma.user.create({
      data: {
        tenantId: tenant.tenantId,
        role: UserRole.DRIVER,
        username: 'driver-baseline-guard',
        employeeNo: 'EMP-BASE-GUARD',
        fullName: 'Driver Baseline Guard',
        passwordHash: await hashPassword('DriverPass123'),
      },
    });

    const baseDate = new Date(`${TEST_DATE}T00:00:00.000Z`);
    await prisma.fuelEntry.createMany({
      data: [
        {
          tenantId: tenant.tenantId,
          siteId: site.id,
          vehicleId: vehicle.id,
          driverId: driver.id,
          entryDate: baseDate,
          liters: new Prisma.Decimal(30),
          sourceType: 'STATION',
          fuelStationId: 'Guard-1',
          odometerKm: 10000,
          createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        },
        {
          tenantId: tenant.tenantId,
          siteId: site.id,
          vehicleId: vehicle.id,
          driverId: driver.id,
          entryDate: baseDate,
          liters: new Prisma.Decimal(31),
          sourceType: 'STATION',
          fuelStationId: 'Guard-2',
          odometerKm: 10010,
          createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
        {
          tenantId: tenant.tenantId,
          siteId: site.id,
          vehicleId: vehicle.id,
          driverId: driver.id,
          entryDate: baseDate,
          liters: new Prisma.Decimal(95),
          sourceType: 'STATION',
          fuelStationId: 'Guard-3',
          odometerKm: 10020,
          createdAt: new Date(Date.now() - 5 * 60 * 1000),
        },
      ],
    });

    const response = await request(app)
      .get('/tenanted/dashboard/alerts')
      .query({ date: TEST_DATE })
      .set('host', 'alertsbaselineguard.platform.test')
      .set('authorization', `Bearer ${tenant.token}`);

    expect(response.status).toBe(200);
    expect(
      response.body.items.some((item: { alert_type: string }) => item.alert_type === 'suspicious_consumption_deviation'),
    ).toBe(false);
    expect(
      response.body.items.some((item: { alert_type: string }) => item.alert_type === 'suspicious_high_liters_vs_distance'),
    ).toBe(false);
    expect(
      response.body.items.some((item: { alert_type: string }) => item.alert_type === 'fueling_too_soon_after_previous_fill'),
    ).toBe(true);
  });

  it('enforces tenant isolation for alert reads', async () => {
    const platformToken = await createPlatformOwner();
    const tenantA = await createTenantWithAdmin(platformToken, 'alertisoa', 'alertisoadmin');
    const tenantB = await createTenantWithAdmin(platformToken, 'alertisob', 'alertisobadmin');

    const siteA = await prisma.site.create({
      data: {
        tenantId: tenantA.tenantId,
        siteCode: 'A-01',
        siteName: 'Tenant A Site',
      },
    });

    await prisma.vehicle.create({
      data: {
        tenantId: tenantA.tenantId,
        fleetNumber: 'A-FLEET-001',
        plateNumber: 'A-001',
        siteId: siteA.id,
      },
    });

    const responseA = await request(app)
      .get('/tenanted/dashboard/alerts')
      .query({ date: TEST_DATE })
      .set('host', 'alertisoa.platform.test')
      .set('authorization', `Bearer ${tenantA.token}`);

    const responseB = await request(app)
      .get('/tenanted/dashboard/alerts')
      .query({ date: TEST_DATE })
      .set('host', 'alertisob.platform.test')
      .set('authorization', `Bearer ${tenantB.token}`);

    expect(responseA.status).toBe(200);
    expect(responseB.status).toBe(200);
    expect(responseA.body.summary.total_alerts).toBeGreaterThanOrEqual(1);
    expect(responseB.body.summary.total_alerts).toBe(0);
    expect(
      responseB.body.items.some((item: { vehicle: { fleet_no: string } | null }) => item.vehicle?.fleet_no === 'A-FLEET-001'),
    ).toBe(false);
  });
});
