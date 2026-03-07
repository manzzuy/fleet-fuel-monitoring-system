# Security Checklist

## Tenant Isolation Checks

- Tenant is resolved from subdomain only.
- No tenant-owned endpoint accepts `tenant_id` from client input as an authorization selector.
- Every tenant-owned query and mutation is tenant-scoped.
- JWT `tenant_id` must match resolved tenant context.
- Cache keys and async jobs carry tenant context explicitly.
- File storage keys and metadata are tenant-scoped.
- Logs and exports do not leak cross-tenant data.

## Auth Hardening

- Passwords hashed with Argon2id.
- Short-lived access tokens with explicit expiration.
- Distinct role model for staff, driver, and platform accounts.
- Authorization checks verify both role and tenant context.
- Login failures are rate limited and observable.
- Password reset and future verification flows must be rate limited and audited.

## Rate Limiting

- Login endpoint
- Password reset endpoints
- File upload endpoints
- Any future public lookup or invite endpoints
- Protect by IP and, where applicable, by tenant-aware dimensions

## Input Validation

- Validate all request bodies, params, and query strings at the boundary.
- Reject unknown enum values, oversized strings, and malformed identifiers.
- Sanitize or reject unsupported file metadata.
- Never trust client-calculated totals, ownership, or tenant references.

## File Upload Rules

- Validate content type, extension, and size.
- Generate server-side storage keys only.
- Store receipts in tenant-prefixed object paths.
- Preserve metadata rows with tenant ownership.
- Include antivirus scanning hook before finalizing file state.
- Reject direct-public access by default.

## Audit Logging Requirements

Record at least these events:

- login success
- login failure
- password reset requested
- password changed
- vehicle created or updated
- driver created or updated
- assignment created, changed, or removed
- daily check submitted
- fuel entry submitted
- receipt uploaded
- permission denied on sensitive route

For every audit event include:

- request_id when available
- actor id
- actor type
- tenant id when tenant-scoped
- action name
- target resource type and id where relevant
- timestamp

## Security Review Gates

- No unresolved critical tenant-boundary findings
- No auth bypass path left untested
- No unvalidated upload path
- No sensitive logging of secrets or raw credentials
