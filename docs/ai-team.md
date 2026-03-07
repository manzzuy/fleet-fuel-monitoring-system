# AI Team

## Agent Directory

### 1) `product_owner`
- Purpose: frame scope, non-goals, acceptance criteria, and release sequencing.
- Use when: a request is vague, too broad, or needs phased delivery.
- Skills: `feature-delivery`, `fleet-fuel-domain`.
- MCP: none required by default.

### 2) `architect`
- Purpose: define boundaries, tenancy-safe architecture, and ADR-grade decisions.
- Use when: module ownership, data boundaries, or platform direction changes.
- Skills: `fleet-fuel-domain`, `tenant-safety-review`, `feature-delivery`.
- MCP: `openaiDeveloperDocs` for standards verification.

### 3) `designer_uiux`
- Purpose: define system behavior, page specs, interaction states, and UX consistency.
- Use when: UI workflow or interaction behavior changes.
- Skills: `fleet-fuel-domain`, `feature-delivery`, `driver-mobile-ux`.
- MCP: `pencil` for exploration/wireframes only.

### 4) `backend`
- Purpose: implement API, schema/migrations, auth, tenancy enforcement, and jobs.
- Use when: contracts, persistence, or server behavior changes.
- Skills: `fleet-fuel-domain`, `tenant-safety-review`, `feature-delivery`.
- MCP: `openaiDeveloperDocs` when validating framework behavior.

### 5) `frontend_admin`
- Purpose: implement admin SaaS UI with approved contracts/specs.
- Use when: admin pages, state integration, or admin navigation changes.
- Skills: `fleet-fuel-domain`, `feature-delivery`.
- MCP: `playwright` for implementation smoke checks when needed.

### 6) `frontend_driver`
- Purpose: implement driver PWA flows optimized for real field usage.
- Use when: mobile workflows, capture flows, or offline/interruptible states change.
- Skills: `fleet-fuel-domain`, `feature-delivery`, `driver-mobile-ux`.
- MCP: `playwright` for mobile-flow validation when needed.

### 7) `qa`
- Purpose: test strategy, acceptance validation, and release confidence.
- Use when: behavior changed and regression risk exists.
- Skills: `playwright-smoke-tests`, `feature-delivery`, `tenant-safety-review`, `driver-mobile-ux` for driver checks.
- MCP: `playwright` for smoke/regression verification.

### 8) `security`
- Purpose: threat modeling and tenant isolation review.
- Use when: auth, tenancy, uploads/imports, or trust boundaries change.
- Skills: `tenant-safety-review`.
- MCP: none required by default.

### 9) `data_import`
- Purpose: onboarding import preview→commit behavior and validation strategy.
- Use when: spreadsheet ingestion, mapping, idempotency, or row-level errors change.
- Skills: `fleet-fuel-domain`, `tenant-safety-review`, `feature-delivery`.
- MCP: none required by default.

### 10) `monitor`
- Purpose: observe runtime/process status and summarize evidence.
- Use when: long-running commands, flaky environments, or runtime failures occur.
- Skills: `playwright-smoke-tests` patterns for quick status checks.
- MCP: `playwright` when UI runtime state must be observed.

## Example Multi-Agent Workflow

1. Product Owner defines goal, non-goals, and acceptance criteria.
2. Architect validates tenancy boundaries and module impact.
3. Designer defines flow/state/page behavior for admin and or driver.
4. Backend + Frontend implement in parallel against agreed contracts.
5. QA validates acceptance and regressions (Playwright when needed).
6. Security audits tenant-sensitive and auth-sensitive changes.

## Example Prompt To Spawn Agent Work

```text
Use product_owner to define scope and acceptance criteria for <feature>.
Then use architect to validate tenancy boundaries and architecture impact.
Then use designer_uiux to define flow/spec updates.
Then implement via backend + frontend_admin/frontend_driver in parallel.
Then use qa for validation and security for tenant/auth audit findings.
```

## Project Definition Of Done

- Scope and non-goals are explicit.
- Architecture impact is documented when boundaries changed.
- UX docs/spec references are updated when UI changed.
- DB changes include migration review and tenancy-safety review.
- Tests are added/updated to cover critical paths and failure states.
- QA validation is completed with evidence.
- Security review is completed for relevant risk areas.
- Documentation is updated for operators and developers.
