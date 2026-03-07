# API Workspace Notes

## Prisma CLI Configuration

This workspace uses Prisma's file-based CLI config at:

- `apps/api/prisma.config.ts`

That config points Prisma at:

- schema: `prisma/schema.prisma`
- migrations: `prisma/migrations`
- seed command: `tsx prisma/seed.ts`

Run Prisma commands from `apps/api`:

- `pnpm -C apps/api prisma generate`
- `pnpm -C apps/api prisma migrate dev`
- `pnpm -C apps/api prisma migrate deploy`
- `pnpm -C apps/api prisma db seed`

## Drift Safety

Prisma drift happened because the API was pointed at an existing database with unrelated tables and migration history.

This workspace now uses a clean local development database:

- `fleet_fuel_platform_dev`

Use that database for normal local development so Prisma migrations match this repo's history.

Only use `prisma migrate reset` on disposable databases created only for this project. Never use it on shared, legacy, or important databases.

## Test Database

API smoke tests use `apps/api/.env.test`.

- `DATABASE_URL` in `.env.test` points to the dedicated test database
- the test runner creates the database if needed
- Prisma migrations are applied before tests run
- each test cleans up the rows it created

The test suite does not seed dummy tenants.
