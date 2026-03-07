# Staging Deployment Notes

This directory documents the first controlled staging deployment path for Fleet Fuel Monitoring.

## Source of Truth

- GitHub repository and protected branches are the source of truth.
- CI runs on push/PR using `.github/workflows/ci.yml`.
- Staging deployment is manual via `.github/workflows/deploy-staging.yml`.

## Required GitHub Environment

Create a GitHub Environment named `staging`.

Add repository/environment variables:

- `STAGING_API_BASE_URL`
- `STAGING_ADMIN_BASE_URL`
- `STAGING_DRIVER_BASE_URL`
- `STAGING_TENANT_HOST`
- `STAGING_PLATFORM_BASE_DOMAIN`

Add repository/environment secrets:

- `STAGING_DATABASE_URL`
- `STAGING_TENANT_ADMIN_IDENTIFIER`
- `STAGING_TENANT_ADMIN_PASSWORD`
- `STAGING_DEPLOY_HOOK_API`
- `STAGING_DEPLOY_HOOK_ADMIN`
- `STAGING_DEPLOY_HOOK_DRIVER`

## Deployment Sequence

The deploy workflow performs:

1. configuration validation
2. dependency install + build
3. service deploy hooks (API/admin/driver)
4. `pnpm deploy:migrate` (`prisma migrate deploy`)
5. post-deploy health checks
6. tenanted System Status verification with stub notification mode guard

## Notification Safety

Keep staging notification mode stub-safe by default:

- `NOTIFICATION_PROVIDER=stub`
- `NOTIFICATION_DELIVERY_ENABLED=false`
- `NOTIFICATION_ALLOW_REAL_SENDS_OUTSIDE_PRODUCTION=false`

## Rollback Expectation

- Re-deploy the previous known-good app revision with service deploy hooks.
- Restore DB from backup only when data integrity is impacted.
- Re-run health + smoke checks before reopening staging for UAT.
