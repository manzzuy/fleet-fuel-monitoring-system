import { Prisma } from '@prisma/client';

import { prisma } from '../db/prisma';
import { env } from '../config/env';
import { getNotificationProviderReadiness } from './notification-dispatch.service';

const REQUIRED_TABLES = [
  'tenants',
  'tenant_domains',
  'users',
  'sites',
  'vehicles',
  'tanks',
  'daily_checks',
  'fuel_entries',
  'tenant_notification_settings',
  'notification_outbox',
] as const;

async function getMissingTables() {
  const rows = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (${Prisma.join(REQUIRED_TABLES)})
  `;

  const available = new Set(rows.map((row) => row.table_name));
  return REQUIRED_TABLES.filter((name) => !available.has(name));
}

export async function getTenantedSystemStatus(requestId: string) {
  const notificationReadiness = getNotificationProviderReadiness();

  let databaseReachable = true;
  let databaseError: string | null = null;
  let missingTables: string[] = [];
  try {
    await prisma.$queryRaw`SELECT 1`;
    missingTables = await getMissingTables();
  } catch (error) {
    databaseReachable = false;
    databaseError = error instanceof Error ? error.message : 'Database check failed.';
    missingTables = [...REQUIRED_TABLES];
  }

  const migrationReady = databaseReachable && missingTables.length === 0;
  const configReadiness =
    env.NOTIFICATION_PROVIDER === 'stub' ||
    (notificationReadiness.configured &&
      (!env.NOTIFICATION_DELIVERY_ENABLED || notificationReadiness.real_send_allowed_in_env));

  return {
    status: databaseReachable && migrationReady ? 'ok' : 'degraded',
    environment: {
      name: env.NODE_ENV,
      app_version: env.APP_VERSION,
      build_sha: env.APP_BUILD_SHA ?? null,
    },
    services: {
      api: {
        reachable: true,
      },
      database: {
        reachable: databaseReachable,
        ...(databaseError ? { error: databaseError } : {}),
      },
      notifications: {
        mode: env.NOTIFICATION_PROVIDER,
        readiness: notificationReadiness.status,
        delivery_enabled: notificationReadiness.delivery_enabled,
      },
    },
    readiness: {
      config_ready: configReadiness,
      migration_ready: migrationReady,
      missing_tables: missingTables,
    },
    request_id: requestId,
  };
}
