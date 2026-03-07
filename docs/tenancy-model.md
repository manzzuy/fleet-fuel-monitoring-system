# Tenancy Model

## Core Rule

Tenant identity is resolved from the request subdomain only.

Example:

- `maqshan.platform.test` resolves to tenant subdomain `maqshan`

The platform never accepts `tenant_id` from client payloads, query params, or route params as an authorization input.

## Subdomain Parsing Rules

1. Prefer trusted forwarded host headers only when they come from approved infrastructure.
2. Otherwise use the raw `Host` header.
3. Normalize to lowercase.
4. Strip the port suffix.
5. Require exactly one tenant label before the platform base domain.
6. Reject naked base domains for tenanted routes.
7. Reject nested labels such as `foo.bar.platform.test`.
8. Resolve the tenant from the canonical domain mapping table.

## Tenant Resolution Contract

- Input:
  - trusted effective host
- Output:
  - `tenant.id`
  - `tenant.subdomain`
  - `tenant.status`
- Failure behavior:
  - unknown tenant returns a hard-stop not-found response
  - suspended or inactive tenants may later map to a blocked-tenant response
- Attachment point:
  - middleware attaches the resolved tenant context before auth-sensitive handlers run

## Local Development Host Mapping

- Add local hosts entries such as:
  - `127.0.0.1 maqshan.platform.test`
- Run admin and driver surfaces on localhost ports while preserving the tenant host where possible.
- When a local proxy or frontend dev server forwards API calls, it must forward the effective host explicitly for tenant-aware requests.

## Enforcement Points

### API Boundary

- Tenant middleware resolves and attaches tenant context.
- Auth middleware rejects JWTs whose `tenant_id` does not match the resolved tenant.
- Route handlers and services never accept `tenant_id` from client-controlled input.

### Persistence Layer

- Every tenant-owned query, mutation, and uniqueness rule must include `tenant_id`.
- Background jobs and batch processes must receive tenant context explicitly.
- Cache keys must include tenant context where cached data is tenant-owned.

### File And Storage Layer

- Storage keys must include tenant-safe prefixes.
- Metadata rows must include tenant ownership.
- File retrieval must validate tenant ownership before access.

### Frontend Layer

- Frontends derive tenant context from the host, not from user-selectable controls.
- URLs may deep-link into tenant-owned resources, but server authorization remains authoritative.

## Isolation Rules

- No cross-tenant reads.
- No cross-tenant writes.
- No shared client caches for tenant-owned data.
- No shared exports or file paths without tenant scoping.
- No operational shortcut that bypasses tenant resolution.
