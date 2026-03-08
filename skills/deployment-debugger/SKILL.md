# deployment-debugger

Purpose: diagnose and resolve deployment problems for a multi-tenant Node.js SaaS on Railway with minimal, safe fixes.

## Scope

Use this skill when the platform fails after deploy, staging behaves differently from local, or tenant-scoped routing/auth breaks in hosted environments.

Priority order:

1. service boot and env validation
2. database migration state
3. request routing and host resolution
4. auth/cors edge behavior
5. frontend-to-api connectivity

## Diagnosis Workflow

1. Collect evidence first:
   - Railway deploy logs
   - runtime logs from API and frontend
   - failing request URL, host, response code, request_id
2. Confirm environment:
   - `NODE_ENV`, `PORT`, `DATABASE_URL`, `JWT_SECRET`, `PLATFORM_BASE_DOMAIN`, `ALLOWED_ORIGINS`
   - frontend `NEXT_PUBLIC_API_BASE_URL` and base-domain values
3. Reproduce with explicit host headers using `curl`.
4. Apply the smallest safe fix.
5. Re-run health and tenant route checks.

## Common Failure Patterns and Fixes

### 1) Express trust proxy misconfiguration

Symptom:
- `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` in logs
- incorrect client IP handling behind Railway proxy

Required fix:
- add:
  - `app.set('trust proxy', 1);`

Placement rule:
- insert immediately after:
  - `const app = express();`
- file:
  - `apps/api/src/app.ts`

### 2) Prisma migration failures

Symptoms:
- service boots but DB queries fail with missing relation/table
- deploy logs show migrate errors

Checks:
- ensure deploy path runs `prisma migrate deploy` (not `migrate dev`)
- verify `DATABASE_URL` targets the intended Railway database

Fix approach:
- run migration deploy in the release/startup sequence
- do not reset or use destructive migration commands in shared environments

### 3) Missing environment variables

Symptoms:
- startup validation failure
- 500s during auth or tenant resolution

Checks:
- compare required env vars with app config schema
- validate staging/prod GitHub/Railway env mappings

Fix approach:
- add missing variables in Railway service/environment
- keep notification mode stub-safe by default unless explicitly approved

### 4) Tenant host routing issues

Symptoms:
- `tenant_not_found` for valid tenants
- tenant login works locally but fails in Railway

Checks:
- incoming `Host` / `x-forwarded-host`
- wildcard/subdomain DNS configuration
- `PLATFORM_BASE_DOMAIN` alignment

Fix approach:
- align base domain config to deployed hostnames
- verify wildcard routing and reverse proxy behavior

### 5) API CORS problems

Symptoms:
- browser preflight failures
- blocked cross-origin calls from admin or driver app

Checks:
- `ALLOWED_ORIGINS` includes staging/prod origins
- wildcard tenant subdomain logic accepted server-side

Fix approach:
- add explicit trusted origins
- keep preflight (`OPTIONS`) enabled

### 6) Frontend API base URL issues

Symptoms:
- frontend loads but API calls fail or hit localhost
- auth or data fetch fails only in deployed frontend

Checks:
- `NEXT_PUBLIC_API_BASE_URL`
- frontend build-time env values in Railway

Fix approach:
- set correct API base URL per environment
- rebuild/redeploy frontend after env changes

## Safety Rules

- Never accept tenant_id from client to “work around” host issues.
- Never disable tenant scoping checks to “unblock” deployment.
- Prefer reversible, minimal config/code changes.
- Document root cause and exact verification steps after fix.
