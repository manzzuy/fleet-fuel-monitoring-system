# Phase 5 Driver UAT

## Goal

Validate field-usable driver workflow for checklist and fuel submission before pilot launch.

## Preconditions

- Tenant host resolves correctly
- Driver credentials are available
- Driver assignment context exists (vehicle/site as applicable)
- API + driver PWA are running

## Test Steps

## Login and Dashboard

- [ ] Driver sign-in succeeds
- [ ] Driver dashboard loads
- [ ] Assigned context is visible

## Daily Checklist Flow

- [ ] Driver opens daily checklist from dashboard
- [ ] Checklist definition loads
- [ ] Driver can complete required items
- [ ] Submit succeeds with clear success feedback
- [ ] Retry/error message is clear when forced failure is simulated

## Fuel Entry Flow

- [ ] Driver opens fuel entry from dashboard
- [ ] Controlled `source_type` selection works
- [ ] Liters + vehicle context submit successfully
- [ ] Odometer entry works
- [ ] Odometer fallback requires explicit reason and submits correctly
- [ ] `approved_source` requires context before submit

## Receipt Upload Path

- [ ] Receipt attach/upload works
- [ ] If upload fails, driver sees actionable retry feedback
- [ ] Submission still follows current policy behavior

## Cross-Surface Verification

- [ ] Submitted daily checklist is visible in admin monitoring
- [ ] Submitted fuel entry is visible in admin monitoring

## Pilot Constraints

- Notification delivery remains stub-safe by default.
- Driver app focuses on operational submission, not investigation workflows.
- Manual fallback behavior must remain auditable.

## Pass Criteria

- End-to-end checklist and fuel submission succeed
- Cross-surface visibility is confirmed
- No auth/tenant isolation regression
- No blocking UX errors on core field actions
