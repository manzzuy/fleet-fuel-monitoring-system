# Architecture Overview

Fleet Fuel Monitoring is a production-grade multi-tenant SaaS platform delivered as a pnpm monorepo.

## System Diagram

```text
Admin Browser (tenant subdomain) ─┐
                                  ├─> Next.js Admin Web ─┐
Driver PWA (tenant subdomain)  ───┘                      │
                                                         ├─> REST API (Express)
                                                         │    ├─ tenant resolution middleware
                                                         │    ├─ auth and authorization
                                                         │    ├─ domain modules
                                                         │    └─ structured logging + request_id
                                                         │
                                                         ├─> PostgreSQL (shared DB, shared schema, tenant_id columns)
                                                         ├─> Redis (rate limiting, cache, queues later)
                                                         └─> Object Storage (receipt images later)

Shared Package
  ├─ shared DTOs and zod schemas
  ├─ auth claim types
  └─ tenant host parsing utilities
```

## Module Boundaries

### `apps/api`

- Entry points, middleware, route registration, domain services, persistence orchestration, auth, and tenancy enforcement.
- Owns request validation, authorization, error formatting, structured logging, and integration boundaries.

### `apps/admin-web`

- Tenant-scoped admin application.
- Owns admin navigation shell, dashboard, CRUD workflows, and operational reporting UI.
- Must implement only from approved UX specs and API contracts.

### `apps/driver-pwa`

- Tenant-scoped driver application.
- Owns mobile-first workflows such as daily checks, assignments, and fuel entries.
- Must optimize for low-friction interaction, offline resilience, and clear error handling.

### `packages/shared`

- Shared contracts only.
- Holds DTOs, zod schemas, auth claim types, tenant parsing helpers, and other cross-app utilities that do not pull runtime-specific dependencies.

## Core Data Flow

1. Request arrives on a tenant subdomain such as `maqshan.platform.test`.
2. Frontend preserves the effective host when calling the API.
3. API resolves tenant from trusted host data.
4. Tenant-aware middleware attaches the resolved tenant context.
5. Auth verifies the JWT and enforces `tenant_id` match.
6. Domain services execute only tenant-scoped queries.
7. Structured logs record request outcome with request correlation metadata.

## Environments

### Local

- Apps run on localhost ports.
- Tenant behavior is emulated with local host mapping such as `maqshan.platform.test`.
- Docker provides PostgreSQL and Redis.

### Development

- Shared team environment with non-production integrations.
- Production-like tenancy rules remain mandatory.
- Lower-risk secrets and storage buckets only.

### Production

- Managed PostgreSQL, Redis, object storage, centralized logging, and monitored alerting.
- Strict host validation, secrets management, and operational auditing.

## Observability Baseline

- Structured logs from API with `request_id`, route, status code, duration, and tenant context where safe.
- Frontend error capture for admin and driver clients.
- Metrics baseline:
  - request rate
  - error rate
  - p95 and p99 latency
  - login failures
  - rate-limit triggers
  - file upload failures
- Audit events for auth-sensitive and tenant-sensitive actions.

## Architecture Rules

- Tenant is derived from subdomain only.
- Tenant context is never client-selected.
- Every tenant-owned query must be scoped.
- Shared contracts belong in `packages/shared`; business logic does not.
- ADRs are required for durable changes to tenancy, identity, API conventions, storage, or frontend structure.
