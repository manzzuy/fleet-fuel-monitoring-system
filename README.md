# fleet-fuel-platform

Bootstrap monorepo for a multi-tenant fleet fuel SaaS platform.

## Quick start

1. Copy the example env files:
   - `cp .env.example .env`
   - `cp apps/api/.env.example apps/api/.env`
   - `cp apps/admin-web/.env.example apps/admin-web/.env.local`
   - `cp apps/driver-pwa/.env.example apps/driver-pwa/.env.local`
2. Add tenant hosts to your hosts file:
   - `127.0.0.1 maqshan.platform.test`
3. Start local infrastructure:
   - `docker compose -f infra/docker/docker-compose.yml up -d`
4. Install dependencies:
   - `pnpm install`
5. Set required env values before seeding:
   - `PLATFORM_OWNER_EMAIL`
   - `PLATFORM_OWNER_PASSWORD`
   - `JWT_SECRET`
   - `DATABASE_URL`
6. Run the initial migration and platform-owner seed:
   - `pnpm -C apps/api prisma migrate deploy`
   - `pnpm -C apps/api prisma db seed`
7. Start the workspace:
   - `pnpm dev`
8. Open the apps with the tenant host:
   - Platform admin web: `http://localhost:3000`
   - Driver PWA after tenant creation: `http://maqshan.platform.test:3001`

## Local PostgreSQL Setup

This repo now uses a clean local development database:

- development: `fleet_fuel_platform_dev`
- tests: `fleet_fuel_platform_test`

We intentionally avoid using `fleet_fuel_monitoring` because it may already contain old schemas or tables from earlier work. Pointing Prisma at that database causes drift.

### Confirm PostgreSQL is running

Run:

```bash
brew services list | grep postgresql
```

Expected result:

- You should see PostgreSQL with status `started`

If it is not running, start the version installed on your machine. Example:

```bash
brew services start postgresql@16
```

### Create the clean development database

Run:

```bash
make db-create
```

Manual alternative:

```bash
createdb fleet_fuel_platform_dev
```

### Run migrations

Run:

```bash
make db-migrate
```

Manual alternative:

```bash
cd apps/api && pnpm prisma migrate deploy
```

### Start the apps

Run:

```bash
make dev
```

## Services

- API: `http://localhost:5001`
- Admin web: `http://localhost:3000`
- Driver PWA: `http://maqshan.platform.test:3001`

## Phase 1 Core Tenant Flows

Tenant-scoped admin routes now include:

- `GET /tenanted/dashboard/summary`
- `POST /tenanted/fuel-entries`
- `GET /tenanted/fuel-entries`
- `GET /tenanted/checklists/master`
- `POST /tenanted/daily-checks`
- `GET /tenanted/daily-checks`
- `GET /tenanted/daily-checks/:id`
- `PUT /tenanted/daily-checks/:id/submit`

Admin web tenant pages:

- `http://{tenant}.platform.test:3000/dashboard`
- `http://{tenant}.platform.test:3000/fuel`
- `http://{tenant}.platform.test:3000/daily-checks`

## Environment Variables

Root:

- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `PLATFORM_OWNER_EMAIL`
- `PLATFORM_OWNER_PASSWORD`

API:

- `apps/api/.env` follows the same database and platform owner values
- `apps/api/.env.test` is reserved for API smoke tests and uses its own clean test database
- `NOTIFICATION_PROVIDER` defaults to `stub`
- `NOTIFICATION_DELIVERY_ENABLED` defaults to `false`
- `APP_VERSION` and `APP_BUILD_SHA` can be set for deployment status visibility

## Local Tenant Development

Local development uses the browser host plus a hosts-file mapping for tenant-scoped routes. This keeps tenancy host-driven and avoids client-controlled tenant selection.

- Add `127.0.0.1 maqshan.platform.test` to your hosts file.
- Use `localhost:3000` for the platform owner console.
- Use tenant hosts such as `maqshan.platform.test` only after the platform owner creates that tenant.
- The frontend forwards the current request host to the API as `x-forwarded-host`, which the API treats as the trusted effective host for tenant resolution in this local setup.

## Platform Owner Seed

- No tenant data is seeded.
- The seed creates exactly one platform owner from environment variables:
  - `PLATFORM_OWNER_EMAIL`
  - `PLATFORM_OWNER_PASSWORD`

## Running Docker Services

- `make up`
- `make down`

Manual alternative:

- `docker compose -f infra/docker/docker-compose.yml up -d`
- `docker compose -f infra/docker/docker-compose.yml down`

## Running Apps

- All apps:
  - `make dev`
- API only:
  - `make api`
- Admin web only:
  - `make web`
- Driver PWA only:
  - `make pwa`

Manual alternative:

- `pnpm dev`
- `pnpm -C apps/api dev`
- `pnpm -C apps/admin-web dev`
- `pnpm -C apps/driver-pwa dev`

## Database Safety

- Do not point this repo at `fleet_fuel_monitoring`
- Do not run `prisma migrate reset` against shared or important databases
- Use `fleet_fuel_platform_dev` for local development only
- Use `fleet_fuel_platform_test` for tests only

## Bootstrap Flow

1. Seed the platform owner.
2. Sign in on `http://localhost:3000`.
3. Create a tenant and its primary subdomain.
4. (Optional) Run Platform Onboarding Import with a customer workbook (preview then commit).
5. Open tenant-scoped routes such as `http://maqshan.platform.test:3001`.

## Onboarding Troubleshooting

If onboarding upload/preview fails with `db_not_migrated`, your local development database is missing required tables.

Run:

```bash
make db-migrate
```

or:

```bash
cd apps/api && pnpm prisma migrate deploy
```

Then restart your dev servers.

## Running Tests

- API smoke tests:
  - `make test`
  - `pnpm -C apps/api test`

Prisma CLI:

- `pnpm -C apps/api prisma generate`
- `pnpm -C apps/api prisma migrate deploy`

The API test suite uses `apps/api/.env.test`, creates its own test database if needed, runs Prisma migrations with the test connection string, and cleans up all rows after each test.

## Phase 5 Deployment and Pilot Readiness

Deployment-safe scripts:

- `pnpm deploy:build`
- `pnpm deploy:migrate`
- `pnpm deploy:boot:api`

System Status (admin):

- Open `http://{tenant}.platform.test:3000/settings`
- Check **System Status** for API/DB reachability, notification mode/readiness, and migration/config readiness.

Backup/restore scripts:

- `DATABASE_URL='postgresql://...' ./infra/scripts/backup-db.sh ./backups`
- `DATABASE_URL='postgresql://...' ./infra/scripts/restore-db.sh ./backups/<file>.dump`

See `docs/phase-5-deployment-readiness.md` for full operator guidance.

## GitHub Staging CI/CD

Repository automation for controlled staging rollout:

- CI: `.github/workflows/ci.yml`
- Manual staging deploy: `.github/workflows/deploy-staging.yml`
- Ownership rules: `.github/CODEOWNERS`

Staging environment setup references:

- `infra/staging/README.md`
- `infra/staging/env.staging.example`
