import path from 'node:path';
import fs from 'node:fs/promises';

import type { PrismaClient } from '@prisma/client';

import { config as loadEnv } from 'dotenv';
import { afterAll, afterEach, beforeAll } from 'vitest';

const envPath = path.resolve(__dirname, '..', '.env.test');
loadEnv({ path: envPath });

let prismaRef: PrismaClient;

beforeAll(async () => {
  ({ prisma: prismaRef } = await import('../src/db/prisma'));
  await prismaRef.$connect();
});

afterEach(async () => {
  await prismaRef.auditLog.deleteMany();
  await prismaRef.onboardingImportBatch.deleteMany();
  await prismaRef.notificationDelivery.deleteMany();
  await prismaRef.notificationOutbox.deleteMany();
  await prismaRef.tenantNotificationSettings.deleteMany();
  await prismaRef.contactSiteAssignment.deleteMany();
  await prismaRef.contactDirectoryEntry.deleteMany();
  await prismaRef.complianceRecord.deleteMany();
  await prismaRef.complianceType.deleteMany();
  await prismaRef.userSiteAssignment.deleteMany();
  await prismaRef.supervisorSite.deleteMany();
  await prismaRef.driverCredential.deleteMany();
  await prismaRef.driverProfile.deleteMany();
  await prismaRef.userAuth.deleteMany();
  await prismaRef.dailyCheckItem.deleteMany();
  await prismaRef.dailyCheck.deleteMany();
  await prismaRef.fuelEntry.deleteMany();
  await prismaRef.tank.deleteMany();
  await prismaRef.equipment.deleteMany();
  await prismaRef.fuelCard.deleteMany();
  await prismaRef.driver.deleteMany();
  await prismaRef.user.deleteMany();
  await prismaRef.vehicle.deleteMany();
  await prismaRef.site.deleteMany();
  await prismaRef.tenantDomain.deleteMany();
  await prismaRef.tenant.deleteMany();
  await prismaRef.platformUser.deleteMany();

  const onboardingStorage = path.resolve(__dirname, '..', 'storage', 'onboarding');
  await fs.rm(onboardingStorage, { recursive: true, force: true });
});

afterAll(async () => {
  await prismaRef.$disconnect();
});
