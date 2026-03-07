# Phase 5 Admin UAT

## Goal

Validate pilot-readiness for transport-manager/site-supervisor operational use on admin surface.

## Preconditions

- Pilot tenant exists and is mapped to host
- Admin user credentials are available
- API/admin services are running
- DB migrations are applied

## Test Steps

## Authentication and Shell

- [ ] Sign in succeeds on tenant admin host
- [ ] Dashboard loads without route/auth errors
- [ ] Sidebar navigation works for all operational modules

## Dashboard and Alerts

- [ ] Dashboard summary cards render
- [ ] Needs-attention/exception sections render
- [ ] Alerts page renders summary + table
- [ ] Alerts drill-down links land on scoped filtered views

## Monitoring Pages

- [ ] Fuel page loads and filters apply
- [ ] Daily Checks monitoring page loads and filters apply
- [ ] Drivers/Vehicles/Sites/Tanks pages load scoped data

## Master Data Editing

- [ ] Add + Edit works for Drivers
- [ ] Add + Edit works for Vehicles
- [ ] Add + Edit works for Sites
- [ ] Add + Edit works for Tanks
- [ ] Save persists; Cancel does not persist
- [ ] Historical operational records remain non-editable

## Compliance

- [ ] Compliance types can be listed
- [ ] Compliance records can be added/edited from driver/vehicle contexts
- [ ] Expired/expiring compliance items appear in alerts

## Settings and Status

- [ ] Settings page loads
- [ ] Notification settings render and save
- [ ] Recipient preview renders with readiness state
- [ ] System Status section renders:
  - [ ] API status
  - [ ] DB status
  - [ ] notification mode/readiness
  - [ ] migration/config readiness

## Role/Site Scope

- [ ] SITE_SUPERVISOR sees only assigned-site data
- [ ] TRANSPORT_MANAGER sees tenant-wide data
- [ ] HEAD_OFFICE_ADMIN sees tenant-wide data
- [ ] no_site_scope_assigned state appears correctly for unassigned supervisor

## Pass Criteria

- All checks pass without P1/P0 regressions
- No cross-tenant or out-of-scope data exposure
- No broken drill-down flows on critical monitoring pages
