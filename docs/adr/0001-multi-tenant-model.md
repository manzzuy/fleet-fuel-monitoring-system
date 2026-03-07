# 0001 Multi-Tenant Model

- Status: Accepted
- Date: 2026-03-04

## Context

Fleet Fuel Monitoring is a single SaaS product serving multiple customer fleets. The platform must isolate tenant data without fragmenting the codebase or creating separate deployments per customer.

## Decision

- Use a shared PostgreSQL database with a shared schema.
- Every tenant-owned table must carry a `tenant_id` column.
- Resolve tenant identity from the request subdomain only.
- Never accept `tenant_id` from client payloads, query params, or route params for authorization.
- Enforce tenant scoping in API services, repositories, cache keys, async jobs, and file storage paths.
- Require JWT `tenant_id` to match the resolved tenant context.
- Treat trusted host/header handling as a security boundary:
  - only trust host forwarding from approved infrastructure paths
  - normalize and validate effective host before tenant resolution
- Unknown tenant domains must hard-stop with tenant-not-found behavior.
- Tenant-domain mapping is a critical control-plane dependency and must be protected, observable, and auditable.

## Alternatives

- Separate database per tenant:
  - Better physical isolation, but too much operational overhead for the current stage.
- Separate schema per tenant:
  - Adds operational complexity and migration risk without enough product leverage.
- Client-selected tenant context:
  - Rejected because it weakens the trust boundary.

## Consequences

- Positive:
  - One deployable system with consistent tenancy rules.
  - Lower operational overhead for migrations and observability.
  - Clear enforcement model across API and frontend.
- Negative:
  - Strong discipline is required to prevent unscoped queries.
  - Shared infrastructure increases blast radius if tenant checks fail.
- Operational:
  - Reviews, tests, and security checks must treat tenant scoping as a first-class quality gate.
  - No cross-tenant access is permitted under any workflow.
