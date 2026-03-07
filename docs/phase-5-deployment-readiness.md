# Phase 5 Deployment and Pilot Readiness

## Scope

This slice prepares safe deployment and pilot operations without adding broad product features.

Included:

- deployment build/migrate/start scripts
- startup environment validation
- migration-safe deployment path (`prisma migrate deploy`)
- backup/restore runbook commands
- tenant admin System Status section in Settings

Excluded:

- live WhatsApp rollout
- dashboard redesign
- analytics expansion

## Deployment Sequence

1. Install dependencies:

```bash
pnpm install
```

2. Build:

```bash
pnpm deploy:build
```

3. Generate Prisma client and apply migrations:

```bash
pnpm deploy:migrate
```

4. Start API (production sequence):

```bash
pnpm deploy:boot:api
```

## Environment Safety

Required in all environments:

- `NODE_ENV`
- `DATABASE_URL`
- `JWT_SECRET`
- `PLATFORM_BASE_DOMAIN`

Notification defaults are safe:

- `NOTIFICATION_PROVIDER=stub`
- `NOTIFICATION_DELIVERY_ENABLED=false`

Meta Cloud API credentials are only required when production delivery is enabled.

## Backup and Restore Readiness

Backup:

```bash
DATABASE_URL='postgresql://...' ./infra/scripts/backup-db.sh ./backups
```

Restore:

```bash
DATABASE_URL='postgresql://...' ./infra/scripts/restore-db.sh ./backups/<file>.dump
```

Retention guidance:

- keep daily backups for 14 days minimum during pilot
- keep weekly snapshots for 8 weeks
- test restore at least once per pilot environment before onboarding critical tenants

## Admin System Status

Settings now includes a lightweight System Status section showing:

- environment label
- API status
- database reachability
- notification mode/readiness
- migration/config readiness summary
- app version/build label

No secrets are exposed.

## Related Phase 5 Checklists

- `docs/phase-5-staging-readiness.md`
- `docs/phase-5-pilot-launch-checklist.md`
- `docs/phase-5-uat-admin.md`
- `docs/phase-5-uat-driver.md`
