import { config } from 'dotenv';
import { resolve } from 'node:path';

import { PrismaClient, UserRole } from '@prisma/client';

import { hashPassword } from '../src/utils/password';

config({ path: resolve(process.cwd(), '.env') });
config({ path: resolve(process.cwd(), '../../.env.test.example') });
config({ path: resolve(process.cwd(), '../../.env.test.local'), override: true });

const prisma = new PrismaClient();

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for local E2E seed.`);
  }
  return value;
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('seed-local-test-user must not run in production.');
  }

  const subdomain = required('E2E_TENANT_SUBDOMAIN').toLowerCase();
  const username = required('E2E_ADMIN_USERNAME').toLowerCase();
  const email = required('E2E_ADMIN_EMAIL').toLowerCase();
  const password = required('E2E_ADMIN_PASSWORD');
  const tenantName = process.env.E2E_TENANT_NAME?.trim() || 'Maqshan Fleet';
  const fullName = process.env.E2E_ADMIN_FULL_NAME?.trim() || 'Maqshan Admin';

  const result = await prisma.$transaction(async (tx) => {
    const existingDomain = await tx.tenantDomain.findUnique({
      where: { subdomain },
      include: { tenant: true },
    });

    const tenant =
      existingDomain?.tenant ??
      (await tx.tenant.create({
        data: {
          name: tenantName,
          domains: {
            create: {
              subdomain,
              isPrimary: true,
            },
          },
        },
      }));

    const existingUser = await tx.user.findFirst({
      where: {
        tenantId: tenant.id,
        OR: [{ username }, { email }],
      },
    });

    const passwordHash = await hashPassword(password);

    const user = existingUser
      ? await tx.user.update({
          where: { id: existingUser.id },
          data: {
            role: UserRole.COMPANY_ADMIN,
            username,
            email,
            fullName,
            isActive: true,
            passwordHash,
          },
        })
      : await tx.user.create({
          data: {
            tenantId: tenant.id,
            role: UserRole.COMPANY_ADMIN,
            username,
            email,
            fullName,
            isActive: true,
            passwordHash,
          },
        });

    return { tenant, user };
  });

  console.log(
    [
      'Local E2E tenant admin ready.',
      `Tenant: ${result.tenant.name} (${subdomain})`,
      `Username: ${result.user.username}`,
      `Email: ${result.user.email}`,
    ].join('\n'),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
