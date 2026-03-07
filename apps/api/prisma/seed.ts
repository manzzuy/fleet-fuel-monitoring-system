import { config } from 'dotenv';
import { PrismaClient, PlatformUserRole } from '@prisma/client';

import { hashPassword } from '../src/utils/password';

config();

const prisma = new PrismaClient();

async function main() {
  const email = process.env.PLATFORM_OWNER_EMAIL?.trim().toLowerCase();
  const password = process.env.PLATFORM_OWNER_PASSWORD;

  if (!email || !password) {
    throw new Error('PLATFORM_OWNER_EMAIL and PLATFORM_OWNER_PASSWORD must be set before seeding.');
  }

  await prisma.platformUser.upsert({
    where: {
      email,
    },
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

  console.log(`Seeded platform owner ${email}. No tenants were created.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
