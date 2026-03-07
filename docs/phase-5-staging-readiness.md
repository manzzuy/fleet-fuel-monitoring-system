# Phase 5 Staging Readiness

## Purpose

Define the minimum controls required before staging sign-off and pilot cutover planning.

## Scope

In scope:

- deploy/build/migrate/start verification
- environment and secret readiness
- API/admin/driver runtime checks
- backup and restore execution proof
- notification safety mode verification

Out of scope:

- new product features
- UI redesign
- broad live notification rollout

## Staging Readiness Checklist

## GitHub and CI/CD

- [ ] `main` branch protection enabled (PR + required checks)
- [ ] CODEOWNERS enabled (`.github/CODEOWNERS`)
- [ ] CI workflow green (`.github/workflows/ci.yml`)
- [ ] Staging deploy workflow is manual and controlled (`.github/workflows/deploy-staging.yml`)
- [ ] GitHub environment `staging` configured with required vars/secrets

## Environment

- [ ] `NODE_ENV=staging` (or equivalent non-production environment label)
- [ ] `DATABASE_URL` points to staging-only database
- [ ] `JWT_SECRET` is strong and non-placeholder
- [ ] `PLATFORM_BASE_DOMAIN` points to staging domain
- [ ] `APP_VERSION` and `APP_BUILD_SHA` are set
- [ ] Notification defaults are safe:
  - [ ] `NOTIFICATION_PROVIDER=stub` unless controlled send validation is explicitly approved
  - [ ] `NOTIFICATION_DELIVERY_ENABLED=false` by default

## Deploy Sequence

- [ ] `pnpm install`
- [ ] `pnpm deploy:build`
- [ ] `pnpm deploy:migrate`
- [ ] `pnpm deploy:boot:api` (or equivalent app-process startup sequence)

## Runtime Verification

- [ ] `GET /health` returns `status=ok`
- [ ] `GET /tenanted/health` works for known tenant host
- [ ] `GET /tenanted/system/status` returns:
  - [ ] API reachable
  - [ ] database reachable
  - [ ] migration/config readiness state
  - [ ] notification mode/readiness
- [ ] Admin Settings page shows **System Status** without leaking secrets

## Regression Gate

- [ ] `pnpm -C apps/api test`
- [ ] `pnpm -C apps/api typecheck`
- [ ] `pnpm -C apps/admin-web exec tsc --noEmit --incremental false`
- [ ] `pnpm -C apps/admin-web e2e:login`
- [ ] `pnpm -C apps/admin-web e2e:phase2-smoke`
- [ ] `pnpm -C apps/admin-web e2e:alerts`
- [ ] `pnpm -C apps/admin-web e2e:settings-notifications`

## Backup/Restore Proof

- [ ] Backup command executed successfully:
  - `DATABASE_URL='postgresql://...' ./infra/scripts/backup-db.sh ./backups`
- [ ] Restore procedure is rehearsed and documented for staging dataset:
  - `DATABASE_URL='postgresql://...' ./infra/scripts/restore-db.sh ./backups/<file>.dump`
- [ ] Operator confirms restore validation path

## Blockers (No-Go)

- Missing or invalid migration state
- Failed regression gate
- Tenant isolation or role/site scope regression
- Notification provider accidentally live in non-production
- No verified backup/restore path
