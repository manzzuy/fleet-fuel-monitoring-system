import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';

export default async function globalSetup() {
  const root = path.resolve(__dirname, '..');
  const envPath = path.join(root, '.env.test');
  loadEnv({ path: envPath });

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL must be configured in apps/api/.env.test');
  }

  process.env.DATABASE_URL = databaseUrl;

  const parsed = new URL(databaseUrl);
  const databaseName = parsed.pathname.replace(/^\//, '');
  parsed.pathname = '/postgres';

  const client = new Client({
    connectionString: parsed.toString(),
  });

  try {
    await client.connect();

    const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [databaseName]);

    if (exists.rowCount === 0) {
      await client.query(`CREATE DATABASE "${databaseName}"`);
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unknown PostgreSQL connection error.';
    throw new Error(
      `Unable to prepare the API test database. Start PostgreSQL with the credentials from apps/api/.env.test or update DATABASE_URL. Original error: ${message}`,
    );
  } finally {
    await client.end().catch(() => undefined);
  }

  execFileSync('pnpm', ['prisma', 'migrate', 'deploy'], {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
    },
  });
}
