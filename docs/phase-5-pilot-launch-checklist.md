# Phase 5 Pilot Launch Checklist

## Purpose

Control first tenant pilot release with explicit go/no-go decisions and rollback readiness.

## Pilot Scope

- First live tenant onboarding and operational use
- Driver checklist/fuel submissions
- Admin monitoring, alerts, settings, and master-data maintenance
- Compliance expiry notification foundation in safe mode

## Pre-Launch Checklist

## Release Control

- [ ] Change window and owner identified
- [ ] Pilot tenant(s) and support contacts confirmed
- [ ] Incident channel and escalation path confirmed

## Data and Migration Safety

- [ ] Production backup taken before rollout
- [ ] Backup artifact integrity verified
- [ ] `pnpm deploy:migrate` executed successfully in target environment
- [ ] System Status shows migration/config readiness

## Notification Safety

- [ ] Default mode remains stub unless explicit controlled-send approval exists
- [ ] If real provider validation is approved:
  - [ ] provider is configured intentionally
  - [ ] delivery enablement is explicit
  - [ ] non-production real-send guard is validated

## Pilot UAT Completion

- [ ] Admin UAT checklist completed (`docs/phase-5-uat-admin.md`)
- [ ] Driver UAT checklist completed (`docs/phase-5-uat-driver.md`)
- [ ] Cross-surface visibility validated (driver submissions visible in admin monitoring)

## Go / No-Go Decision

Go only if all are true:

- [ ] staging readiness checklist fully complete
- [ ] regression gate fully green
- [ ] no P0/P1 security or tenancy findings
- [ ] backup + restore path verified
- [ ] operator runbook owners assigned

No-Go if any are true:

- [ ] failed migrations or missing tables
- [ ] failed auth/tenant isolation checks
- [ ] role/site scope leakage
- [ ] unsafe notification send path
- [ ] missing rollback readiness

## Rollback / Disable Plan

If pilot issues occur:

1. Disable risky paths first:
   - keep notification delivery in stub/disabled mode
   - suspend impacted tenant if required by policy
2. Halt deploy progression and freeze schema changes.
3. Restore database from last known-good backup if data integrity is impacted.
4. Re-deploy previous known-good app version.
5. Re-run smoke/regression checks before resuming tenant traffic.

## Post-Launch Day-1 Checks

- [ ] monitor `/health` and `/tenanted/system/status`
- [ ] verify key admin routes and driver submission flows
- [ ] review alerts volume and false-positive operational impact
- [ ] confirm audit logs for critical write paths
