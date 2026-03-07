# Test Strategy

## Testing Pyramid

### Unit Tests

- Target pure business logic, validators, mappers, tenancy helpers, auth helpers, and UI state reducers.
- Fast and deterministic.
- Highest test volume.

### Integration Tests

- Target API handlers, middleware chains, repository behavior, auth flows, and file-upload validation boundaries.
- Use a test database and seeded tenant fixtures.
- Verify tenant scoping, role enforcement, and error payloads.

### End-To-End Tests

- Use Playwright for critical tenant-scoped user journeys.
- Cover the real browser, routing, auth, and key workflows.
- Keep the suite focused on business-critical paths and regression-prone flows.

## Phase 1 Playwright Target Flows

### Admin

- Login
- View dashboard
- Create vehicle
- Create driver
- Assign driver to vehicle

### Driver

- Login
- Log daily check
- Log fuel entry

## Test Data Strategy

- Use canonical seeded tenants and users for local and CI environments.
- Create fixtures per actor type:
  - admin
  - supervisor
  - driver
- Keep fixture records explicit and tenant-scoped.
- Use separate seed layers:
  - baseline seed for shared local development
  - test seed for deterministic CI runs

## Required Coverage Areas

- Tenant resolution from host
- JWT tenant match enforcement
- Validation failures and error shape consistency
- Role-based access boundaries
- Vehicle, driver, assignment, daily check, and fuel-entry contract behavior
- Receipt-upload rejection behavior for invalid files

## Test Review Rules

- Every tenant-owned module needs unit and integration coverage.
- Every Phase 1 user flow needs at least one Playwright happy path.
- High-risk auth and tenancy behavior also needs failure-path coverage.
- Migration and seed changes must include fixture impact review.
