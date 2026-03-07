# Manual Test Guide

Use this guide to test the local system step by step on a Mac.

This guide is based on the repo as it exists now.

- API port: `5001`
- Admin web port: `3000`
- Driver PWA port: `3001`
- PostgreSQL port: `5432`
- Redis port: `6379`
- Platform login route: `POST /auth/platform-login`
- Tenant login route: `POST /auth/login`
- Platform tenant creation route: `POST /platform/tenants`
- Tenant health route: `GET /tenanted/health`

Important database note:

- Use `fleet_fuel_platform_dev` for local development
- Use `fleet_fuel_platform_test` for tests
- Do not point this repo at `fleet_fuel_monitoring`
- That older database may contain unrelated tables and Prisma will report drift

## 1) One-time setup

### Checklist

- [ ] Install Node.js
- [ ] Install `pnpm`
- [ ] Install Docker Desktop for Mac
- [ ] Install PostgreSQL locally through Homebrew, or have Docker Desktop available
- [ ] Open Terminal
- [ ] Open the repo folder

### 1.1 Confirm Node.js is installed

Run:

```bash
node -v
```

Expected result:

- You should see a version number, for example `v22.x.x`

If it fails:

- Install Node.js from [https://nodejs.org](https://nodejs.org)
- Open a new Terminal window and run the command again

### 1.2 Confirm pnpm is available

Run:

```bash
pnpm --version
```

Expected result:

- You should see a pnpm version number

If it fails:

- Make sure Node.js is installed first
- Install pnpm from [https://pnpm.io/installation](https://pnpm.io/installation)

### 1.3 Confirm Docker Desktop is installed and running

Run:

```bash
docker --version
docker compose version
```

Expected result:

- You should see Docker version output

If it fails:

- Install Docker Desktop from [https://www.docker.com/products/docker-desktop/](https://www.docker.com/products/docker-desktop/)
- Start Docker Desktop
- Wait until Docker says it is running

### 1.4 Confirm PostgreSQL is running

Run:

```bash
brew services list | grep postgresql
```

Expected result:

- You should see PostgreSQL with status `started`

If it fails:

- Install PostgreSQL with Homebrew
- Start the installed version. Example:

```bash
brew services start postgresql@16
```

### 1.5 Go to the repo root

Run:

```bash
cd "/Users/nask/Documents/Feul App"
pwd
```

Expected result:

- The final line should be:

```text
/Users/nask/Documents/Feul App
```

If it fails:

- Make sure the repo exists at that path

## 2) Start backend dependencies

This repo uses Docker for Redis. PostgreSQL may also be started with Docker, but Prisma development should use the clean local database name `fleet_fuel_platform_dev`.

### 2.1 Start Docker services

Run:

```bash
make up
```

If `make` is not available, run:

```bash
docker compose -f infra/docker/docker-compose.yml up -d
```

Expected result:

- Docker starts these containers:
  - `fleet-fuel-postgres`
  - `fleet-fuel-redis`

### 2.2 Confirm the containers are running

Run:

```bash
docker ps
```

Expected result:

- You should see both:
  - `fleet-fuel-postgres`
  - `fleet-fuel-redis`

### 2.3 Confirm PostgreSQL is listening

Run:

```bash
lsof -nP -iTCP:5432 -sTCP:LISTEN
```

Expected result:

- You should see a process listening on port `5432`

### 2.4 Confirm Redis is listening

Run:

```bash
lsof -nP -iTCP:6379 -sTCP:LISTEN
```

Expected result:

- You should see a process listening on port `6379`

If it fails:

- Make sure Docker Desktop is running
- Run `docker ps`
- Run `docker compose -f infra/docker/docker-compose.yml logs postgres`
- Run `docker compose -f infra/docker/docker-compose.yml logs redis`

## 3) Start the apps

### 3.1 Copy the environment files

Run:

```bash
cp .env.example .env
cp .env.test.example .env.test.local
cp apps/api/.env.example apps/api/.env
cp apps/admin-web/.env.example apps/admin-web/.env.local
cp apps/driver-pwa/.env.example apps/driver-pwa/.env.local
```

Expected result:

- The commands finish without errors
- `.env.test.local` now holds local Playwright E2E credentials (gitignored)

### 3.1.1 Local Playwright test credentials (do not commit)

Store local tenant admin test credentials in:

- `.env.test.local` (gitignored)

Tracked template:

- `.env.test.example`

Required variables:

- `E2E_TENANT_SUBDOMAIN`
- `E2E_ADMIN_USERNAME`
- `E2E_ADMIN_EMAIL`
- `E2E_ADMIN_PASSWORD`

Important:

- Never commit real credentials into tracked files.
- Playwright login tests read these environment variables at runtime.

### 3.2 Set the API development environment

Open the API env file:

```bash
nano apps/api/.env
```

Make sure these values exist:

```env
PORT=5001
NODE_ENV=development
DATABASE_URL="postgresql://nask@localhost:5432/fleet_fuel_platform_dev?schema=public"
# If Redis is not installed locally, leave REDIS_URL unset and do not use Redis-backed features.
REDIS_URL=redis://localhost:6379
JWT_SECRET=change-me-in-real-environments
JWT_EXPIRES_IN=15m
PLATFORM_BASE_DOMAIN=platform.test
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
PLATFORM_OWNER_EMAIL=owner@example.com
PLATFORM_OWNER_PASSWORD=ChangeMe123!
APP_VERSION=dev
APP_BUILD_SHA=local
NOTIFICATION_PROVIDER=stub
NOTIFICATION_DELIVERY_ENABLED=false
NOTIFICATION_ALLOW_REAL_SENDS_OUTSIDE_PRODUCTION=false
```

Save and exit:

- Press `Control + O`
- Press `Enter`
- Press `Control + X`

### 3.3 Create the clean development database

Run:

```bash
make db-create
```

Manual alternative:

```bash
createdb fleet_fuel_platform_dev
```

Expected result:

- The database exists
- No tables need to be created manually

If it fails:

- Make sure PostgreSQL is running
- Make sure your local PostgreSQL user is `nask`
- If your local PostgreSQL user is different, update `apps/api/.env` to use your local user name

### 3.4 Install dependencies

Run:

```bash
pnpm install
```

Expected result:

- Install completes without errors

### 3.5 Run Prisma migration

Run:

```bash
make db-migrate
```

Manual alternative:

```bash
cd apps/api && pnpm prisma migrate deploy
```

Expected result:

- Prisma applies migrations successfully
- The database is ready

If it fails:

- Make sure PostgreSQL is running on `5432`
- Make sure `DATABASE_URL` in `apps/api/.env` is correct
- Make sure you are using `fleet_fuel_platform_dev`
- Make sure you are not using `fleet_fuel_monitoring`

If onboarding later reports `db_not_migrated`:

- Run `make db-migrate`
- Restart dev servers

### 3.6 Seed the platform owner only

Run:

```bash
pnpm -C apps/api prisma db seed
```

Expected result:

- You should see a message similar to:

```text
Seeded platform owner owner@example.com. No tenants were created.
```

Important:

- This repo does not seed tenants
- This repo does not seed demo tenant users

### 3.7 Start all apps

Run:

```bash
make dev
```

If `make` is not available, run:

```bash
pnpm dev
```

Expected result:

- API starts on `5001`
- Admin web starts on `3000`
- Driver PWA starts on `3001`

Keep this Terminal window open.

### 3.8 Confirm the ports are listening

Open a second Terminal window and run:

```bash
lsof -nP -iTCP -sTCP:LISTEN | grep -E ':(3000|3001|5001)\b'
```

Expected result:

- You should see listeners on:
  - `3000`
  - `3001`
  - `5001`

If it fails:

- Check the first Terminal window for startup errors
- See the `Common errors & fixes` section below

## 4) Subdomain testing setup (very important)

This system resolves tenants from the browser host name.

### 4.1 Edit `/etc/hosts`

Run:

```bash
sudo nano /etc/hosts
```

Add these lines:

```text
127.0.0.1 platform.test
127.0.0.1 maqshan.platform.test
127.0.0.1 second.platform.test
```

What these mean:

- `platform.test` can be used as a non-tenant local host
- `maqshan.platform.test` will be your first tenant example
- `second.platform.test` will be your second tenant example

Save and exit:

- Press `Control + O`
- Press `Enter`
- Press `Control + X`

### 4.2 Verify the hosts file works

Run:

```bash
ping -c 1 platform.test
ping -c 1 maqshan.platform.test
```

Expected result:

- Both should resolve to `127.0.0.1`

### 4.3 Verify in the browser

Open:

- [http://platform.test:3000](http://platform.test:3000)
- [http://localhost:3000](http://localhost:3000)

Expected result:

- Both should show the platform login screen

Important:

- Tenant routes must be opened on a tenant subdomain such as `maqshan.platform.test`
- Platform routes do not require a tenant

If it fails:

- Re-check `/etc/hosts`
- Fully close and reopen the browser tab

## 5) Test cases

Follow these in order.

### A) API basic health

#### A.1 Test `GET /health`

Run:

```bash
curl http://localhost:5001/health
```

Expected result:

- HTTP response body should look similar to:

```json
{"status":"ok","service":"api","request_id":"..."}
```

If it fails:

- Make sure the API is running on port `5001`
- Check the dev terminal for API errors

### B) Platform login

#### B.1 Open the platform login page

Open in the browser:

- [http://localhost:3000](http://localhost:3000)

Expected result:

- You should see:
  - `Fleet Fuel Platform Owner Console`
  - A `Platform login` form
  - Email field
  - Password field

#### B.2 Log in as platform owner

Use the values from `apps/api/.env`:

- Email: the value of `PLATFORM_OWNER_EMAIL`
- Password: the value of `PLATFORM_OWNER_PASSWORD`

Example:

- Email: `owner@example.com`
- Password: `ChangeMe123!`

Expected result:

- The page changes to the tenant onboarding screen
- You should see:
  - `Tenant onboarding`
  - `Tenant name`
  - `Primary subdomain`
  - `Create initial company admin`

If it fails:

- Make sure you ran the seed step
- Make sure the email and password exactly match the values in `apps/api/.env`
- Check the browser error message under the form

### C) Create tenant (+ optional initial admin)

#### C.1 Create the first tenant with an initial admin

In the platform onboarding form:

- Tenant name: `Maqshan Fleet`
- Primary subdomain: `maqshan`
- Leave `Create initial company admin` checked
- Full name: `Maqshan Admin`
- Username: `maqshanadmin`
- Email: `admin@maqshan.test`
- Password: `StrongPass123`

Click:

- `Create tenant`

Expected result:

- You should see a success message similar to:

```text
Tenant created. Open http://maqshan.platform.test:3000 to sign in on the tenant subdomain.
```

- The tenant list should show a row for:
  - `Maqshan Fleet`
  - `maqshan`
  - `ACTIVE`

If it fails:

- If it says subdomain is in use, pick a new subdomain
- If it says username or email is already in use, change them
- If it says password is invalid, use at least 10 characters with:
  - one uppercase letter
  - one lowercase letter
  - one number

#### C.2 Optional API verification

Run:

```bash
curl -X POST http://localhost:5001/auth/platform-login \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@example.com","password":"ChangeMe123!"}'
```

Copy the `access_token` from the response.

Then run:

```bash
curl http://localhost:5001/platform/tenants \
  -H "Authorization: Bearer YOUR_PLATFORM_TOKEN"
```

Expected result:

- You should see a tenant list containing your new tenant

### D) Tenant resolution test

#### D.1 Known tenant subdomain returns tenant health

Run:

```bash
curl http://localhost:5001/tenanted/health \
  -H "Host: maqshan.platform.test"
```

Expected result:

- Response body should look similar to:

```json
{"status":"ok","tenant_id":"...","subdomain":"maqshan","request_id":"..."}
```

#### D.2 Unknown tenant subdomain returns 404

Run:

```bash
curl http://localhost:5001/tenanted/health \
  -H "Host: missing.platform.test"
```

Expected result:

- Response body should look similar to:

```json
{"error":{"code":"tenant_not_found","message":"Tenant could not be resolved from host."}}
```

If it fails:

- Make sure you created the tenant first
- Make sure you used the exact subdomain you created
- Make sure the `Host` header matches the tenant subdomain

### E) Tenant admin login

#### E.1 Open the tenant admin login page

Open in the browser:

- [http://maqshan.platform.test:3000](http://maqshan.platform.test:3000)

Expected result:

- You should see:
  - `maqshan admin login`
  - `Tenant login`
  - `Email or username`
  - `Password`

#### E.2 Log in with the initial company admin

Use:

- Email or username: `maqshanadmin`
- Password: `StrongPass123`

Expected result:

- You should be redirected to:
  - [http://maqshan.platform.test:3000/dashboard](http://maqshan.platform.test:3000/dashboard)
- You should see:
  - `Tenant dashboard`
  - `maqshan operations`
  - Tenant ID
  - Request ID

If it fails:

- Make sure the tenant was created with `Create initial company admin` enabled
- Make sure you are on `maqshan.platform.test:3000`, not `localhost:3000`
- Make sure the password matches exactly

#### E.3 Verify wrong subdomain does not work

First create a second tenant from the platform console:

- Tenant name: `Second Fleet`
- Primary subdomain: `second`
- Leave `Create initial company admin` unchecked

Then try to log in on:

- [http://second.platform.test:3000](http://second.platform.test:3000)

Use:

- Email or username: `maqshanadmin`
- Password: `StrongPass123`

Expected result:

- Login should fail
- You should see an error like:

```text
Invalid credentials.
```

This is correct because tenant login is scoped to the resolved tenant subdomain.

#### E.4 Seed local tenant admin for Playwright and run login smoke test

If you want deterministic local login smoke checks, seed the local test tenant admin from `.env.test.local`:

```bash
pnpm -C apps/api seed:local-test-admin
```

Then run the Playwright login smoke test:

```bash
pnpm -C apps/admin-web e2e:login
```

Expected result:

- Playwright logs in using env credentials.
- The test passes after navigating to `/dashboard`.

### F) Onboarding import

This flow is now implemented in the platform console.

#### F.1 Prepare onboarding workbook

Create a `.xlsx` file using workbook sheets:

- Required: `Sites`, `Drivers`, `Vehicles_Cards`
- Optional: `Driver_Compliance`, `Supervisor_Sites`, `Tanks`, `Equipment`
- Ignored: `Examples`

Use normalized headers matching these columns:

Sites

- `Site_Code`
- `Site_Name`
- `Location`

Drivers

- `Employee_No`
- `Full_Name`
- `Email`
- `Phone`
- `Role`
- `Site_Code`
- `Driving_License_No`
- `Driving_License_Expiry`
- `OPAL_No`
- `OPAL_Expiry`

Vehicles_Cards

- `Site_Code`
- `Fleet_No`
- `Plate_No`
- `Vehicle_Type`
- `Tank_Capacity_L`
- `Card_Number`
- `Card_Type`
- `Card_Status`

Driver_Compliance

- `Employee_No`
- `Credential_Type`
- `Credential_Number`
- `Expiry_Date`

Supervisor_Sites

- `Supervisor_Employee_No`
- `Site_Code`

Tanks

- `Site_Code`
- `Tank_Name`
- `Capacity_L`
- `Reorder_Level_L`

Equipment

- `Equipment_Code`
- `Equipment_Name`
- `Site_Code`

Use valid references in preview validation:

- `Drivers.Site_Code` must exist in `Sites.Site_Code`
- `Vehicles_Cards.Site_Code` must exist in `Sites.Site_Code`
- `Supervisor_Sites.Site_Code` must exist in `Sites.Site_Code`
- `Driver_Compliance.Employee_No` must exist in `Drivers.Employee_No` (or existing company users by `employeeNo`)

#### F.2 Open platform onboarding UI

Open:

- [http://localhost:3000](http://localhost:3000)

Login as platform owner, then scroll to:

- `Platform onboarding import`

Expected result:

- You should see:
  - tenant dropdown
  - workbook file picker
  - `Upload and Preview` button

#### F.3 Upload and preview

1. Select the target tenant from dropdown.
2. Choose your `.xlsx` file.
3. Click `Upload and Preview`.

Expected result:

- You should see:
  - `Preview summary`
  - total rows, errors, warnings
  - tabs:
    - `Sites`
    - `Drivers`
    - `Vehicles_Cards`
    - `Driver_Compliance` (if present)
    - `Supervisor_Sites` (if present)
    - `Tanks` (if present)
    - `Equipment` (if present)

If there are validation issues:

- They appear per sheet in an error table with:
  - row
  - column
  - code
  - message

#### F.4 Commit import

When preview shows `Errors: 0`, click:

- `Commit Import`

Expected result:

- Success message with:
  - batch id
  - counts for sites/vehicles/drivers/fuel cards
  - tenant login URL

If commit is blocked:

- You will see:
  - `Commit is blocked until preview errors are resolved.`
- Fix workbook errors and re-upload.

### G) Driver PWA login + basic flow

Current status:

- Driver login is not implemented yet
- Daily check is not implemented yet
- Fuel entry is not implemented yet

What is implemented:

- A tenant-aware PWA shell page
- Tenant health display

#### G.1 Open the driver PWA

Open in the browser:

- [http://maqshan.platform.test:3001](http://maqshan.platform.test:3001)

Expected result:

- You should see:
  - `Driver PWA bootstrap`
  - `Fleet Fuel Driver`
  - `Driver shell`
  - Tenant: `maqshan`
  - Tenant ID
  - API request ID

If it fails:

- Make sure the tenant exists
- Make sure you are opening `maqshan.platform.test:3001`
- Make sure the API is running on `5001`

### H) Tenant Dashboard verification

Open:

- [http://maqshan.platform.test:3000/dashboard](http://maqshan.platform.test:3000/dashboard)

Expected result:

- Header shows tenant subdomain and `dev` badge.
- KPI cards show tenant-scoped counts for:
  - Vehicles
  - Drivers
  - Fuel Cards
  - Sites
  - Tanks
- Onboarding status panel shows latest batch ID, status, and imported counts.
- Latest Vehicles and Latest Drivers tables show recent rows (or empty-state guidance when no data exists).

If onboarding was committed successfully:

- KPI values should roughly match your workbook import totals.
- Latest Vehicles should include recently imported fleet numbers.
- Latest Drivers should include recently imported employee numbers/usernames.

### J) Fuel entry + Daily checklist verification

#### J.1 Open Fuel page and create an entry

Open:

- [http://maqshan.platform.test:3000/fuel](http://maqshan.platform.test:3000/fuel)

Expected result:

- KPI mini cards render (`Entries Today`, `Liters Today`, `Vehicles Today`)
- Recent fuel table loads (or empty state)

Create one fuel entry:

- Select a vehicle
- Optional: select driver
- Date: today
- Odometer: any positive integer
- Liters: any positive decimal
- Source type: `MANUAL` (simplest)
- Click `Save fuel entry`

Expected result:

- Success message appears
- New row appears in Recent fuel entries table

#### J.2 Open Daily Checks list and create a check

Open:

- [http://maqshan.platform.test:3000/daily-checks](http://maqshan.platform.test:3000/daily-checks)

Create a daily check:

- Date: today
- Select vehicle
- Optional: select driver
- Click `Create daily check`

Expected result:

- You are redirected to `/daily-checks/{id}`
- Checklist sections/items render

#### J.3 Submit checklist items

On the detail page:

- Set statuses for items (OK / NOT_OK / NA)
- Add notes (optional)
- Click `Submit checklist`

Expected result:

- Success message `Daily checklist submitted.`
- Navigating back to `/daily-checks` shows the check with `SUBMITTED` status.

If it fails:

- Use the `Retry` button in dashboard error state.
- Verify tenant login token is present by signing out and signing in again.
- Check API health:

```bash
curl http://localhost:5001/health
```

### I) Tenant isolation test

#### I.1 Create a second tenant

Go back to:

- [http://localhost:3000](http://localhost:3000)

If needed, sign in again as platform owner.

Create:

- Tenant name: `Second Fleet`
- Primary subdomain: `second`
- Create initial company admin: checked
- Full name: `Second Admin`
- Username: `secondadmin`
- Email: `admin@second.test`
- Password: `StrongPass123`

Expected result:

- Tenant is created successfully

#### I.2 Verify tenant 1 login works only on tenant 1

Open:

- [http://maqshan.platform.test:3000](http://maqshan.platform.test:3000)

Login with:

- Username: `maqshanadmin`
- Password: `StrongPass123`

Expected result:

- Login succeeds

#### I.3 Verify tenant 1 login fails on tenant 2

Open:

- [http://second.platform.test:3000](http://second.platform.test:3000)

Login with:

- Username: `maqshanadmin`
- Password: `StrongPass123`

Expected result:

- Login fails with `Invalid credentials.`

#### I.4 Verify tenant 2 login works only on tenant 2

Open:

- [http://second.platform.test:3000](http://second.platform.test:3000)

Login with:

- Username: `secondadmin`
- Password: `StrongPass123`

Expected result:

- Login succeeds

#### I.5 Verify tenant health returns different tenant IDs

Run:

```bash
curl http://localhost:5001/tenanted/health -H "Host: maqshan.platform.test"
curl http://localhost:5001/tenanted/health -H "Host: second.platform.test"
```

Expected result:

- Both requests return `200`
- Each response has a different `tenant_id`
- Each response has the correct `subdomain`

## 6) Common errors & fixes

### Ports already in use

Symptom:

- App fails to start
- Terminal says port `3000`, `3001`, or `5001` is already in use

Check:

```bash
lsof -nP -iTCP -sTCP:LISTEN | grep -E ':(3000|3001|5001|5432|6379)\b'
```

Fix:

- Stop the old process
- Or close the old Terminal window
- Or restart your Mac if you are unsure what owns the port

### Docker not running

Symptom:

- `docker` commands fail
- Redis or Docker PostgreSQL are unavailable

Fix:

- Open Docker Desktop
- Wait until it says Docker is running
- Run:

```bash
make up
```

### Tenant not found

Symptom:

- `GET /tenanted/health` returns `tenant_not_found`
- Tenant login page cannot authenticate

Fix:

- Make sure the tenant was actually created in the platform console
- Make sure the subdomain in the browser matches the created tenant exactly
- Example:
  - correct: `maqshan.platform.test`
  - wrong: `maqshaan.platform.test`

### Wrong subdomain

Symptom:

- You open `localhost:3000` and see the platform console instead of tenant login

Fix:

- Use the tenant host:
  - [http://maqshan.platform.test:3000](http://maqshan.platform.test:3000)
- Do not use `localhost:3000` for tenant login

### Auth token mismatch across domains

Symptom:

- You log in on one tenant, then switch to another tenant and see login failures or unexpected redirects

Fix:

- Sign out on the tenant dashboard
- Or clear local storage for that site in your browser
- Then log in again on the correct tenant subdomain

### Prisma migration fails

Symptom:

- `prisma migrate deploy` fails

Fix:

- Check `apps/api/.env`
- Make sure:

```env
DATABASE_URL="postgresql://nask@localhost:5432/fleet_fuel_platform_dev?schema=public"
```

- Make sure PostgreSQL is running
- Make sure you are not using `fleet_fuel_monitoring`
- If your PostgreSQL user is not `nask`, update the connection string to your real local user

### Onboarding upload shows `db_not_migrated`

Symptom:

- Upload/preview in Platform Onboarding fails
- UI shows `Database schema is missing required tables for onboarding`

Fix:

- Run:

```bash
make db-migrate
```

- Or:

```bash
cd apps/api && pnpm prisma migrate deploy
```

- Restart API/admin dev servers and retry onboarding

### Platform login fails

Symptom:

- The platform login form shows `Invalid credentials.`

Fix:

- Make sure `PLATFORM_OWNER_EMAIL` and `PLATFORM_OWNER_PASSWORD` were set in `apps/api/.env`
- Run the seed again:

```bash
pnpm -C apps/api prisma db seed
```

### System Status shows migration/config warnings

Symptom:

- Settings page System Status shows `Action required`
- Missing tables list appears

Fix:

- Run:

```bash
make db-migrate
```

- Restart the API process.

### Deployment and backup readiness checks

Run:

```bash
pnpm deploy:build
pnpm deploy:migrate
```

Create backup:

```bash
DATABASE_URL='postgresql://...' ./infra/scripts/backup-db.sh ./backups
```

Restore backup (example):

```bash
DATABASE_URL='postgresql://...' ./infra/scripts/restore-db.sh ./backups/<file>.dump
```

## 7) Done criteria

Use this final checklist.

- [ ] PostgreSQL is running
- [ ] Redis is running if you want the Docker-backed local stack
- [ ] `fleet_fuel_platform_dev` exists
- [ ] `http://localhost:5001/health` returns `status: ok`
- [ ] `http://localhost:3000` shows the platform login form
- [ ] Platform owner can log in
- [ ] Platform owner can create a tenant
- [ ] Platform owner can create an initial company admin for a tenant
- [ ] `GET /tenanted/health` works on a known tenant subdomain
- [ ] `GET /tenanted/health` returns `404` for an unknown tenant subdomain
- [ ] Tenant company admin can log in on the correct tenant subdomain
- [ ] Tenant company admin cannot log in on the wrong tenant subdomain
- [ ] Tenant dashboard shows KPI cards and onboarding status for the tenant
- [ ] Tenant Fuel page allows creating and listing fuel entries
- [ ] Tenant Daily Checks page allows creating and submitting a checklist
- [ ] Settings page shows System Status with API/DB/notification readiness
- [ ] `http://maqshan.platform.test:3001` shows the driver PWA bootstrap page
- [ ] Two tenants return different tenant IDs and stay isolated

If all items above pass, the current local bootstrap is working correctly.
