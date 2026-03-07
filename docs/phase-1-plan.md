# Phase 1 Plan

## Scope

Phase 1 includes:

- multi-tenant foundation
- authentication
- vehicles
- drivers
- driver-to-vehicle assignments
- daily checks
- fuel entries
- basic admin dashboard

## Phase 1 Information Architecture

### Admin Navigation

- Dashboard
- Vehicles
- Drivers
- Assignments
- Daily Checks
- Fuel Entries
- Alerts
- Reports
- Settings

### Driver Navigation

- Home
- Daily Check
- Fuel Entry
- History
- Profile

### Phase 1 Page List

- Admin:
  - Login
  - Dashboard
  - Vehicles list and create/edit
  - Drivers list and create/edit
  - Assignments list and assign flow
  - Daily checks list and detail
  - Fuel entries list and detail
- Driver:
  - Login
  - Home
  - Daily check submit
  - Fuel entry submit
  - Recent history

## Ordered Implementation Steps

### 1. Finalize Architecture And ADR Baseline

- Definition of done:
  - Core ADRs accepted
  - Architecture, tenancy, API, test, and security docs aligned
- Key risks:
  - Drifting implementation before decisions stabilize

### 2. Establish Tenant Resolution And Auth Foundation

- Definition of done:
  - Tenant middleware contract documented
  - Auth identity model documented
  - Login, JWT, and tenant match rules defined
- Key risks:
  - Any shortcut here creates rework across every later module

### 3. Define Domain Modules And Shared Contracts

- Definition of done:
  - API module boundaries agreed for vehicles, drivers, assignments, daily checks, fuel entries, dashboard
  - Shared DTO and validation ownership is clear
- Key risks:
  - UI-driven contract sprawl
  - Cross-module leakage

### 4. Land Persistence And Storage Design

- Definition of done:
  - Table ownership and tenant scoping rules are documented
  - Receipt storage approach and metadata requirements are documented
- Key risks:
  - Inconsistent naming, ownership, or file-link semantics

### 5. Implement Core Admin CRUD Sequence

- Order:
  - vehicles
  - drivers
  - assignments
- Definition of done:
  - Each module has routes, validation, service boundaries, and test plan
  - Admin IA remains consistent across modules
- Key risks:
  - Assignment logic depends on both vehicle and driver identity quality

### 6. Implement Driver Operational Flows

- Order:
  - daily checks
  - fuel entries
- Definition of done:
  - Driver UX spec is complete
  - API contracts are stable
  - File upload rules are enforced for receipts
- Key risks:
  - Mobile ergonomics and upload handling can force avoidable rework if delayed

### 7. Implement Basic Admin Dashboard

- Definition of done:
  - Dashboard reads from already-stable domain modules
  - KPI cards, alerts, and actionable lists follow the approved dashboard spec
- Key risks:
  - Building dashboard before underlying modules stabilizes causes duplicate logic

### 8. Harden With QA, Security, And Operational Checks

- Definition of done:
  - Unit, integration, and E2E coverage for Phase 1 flows
  - Security checklist reviewed
  - Logging and request tracing baselines in place
- Key risks:
  - Shipping without tenant-isolation regression coverage

## Delivery Rule

Do not start feature implementation out of sequence if it bypasses tenancy, auth, or contract stabilization work.
