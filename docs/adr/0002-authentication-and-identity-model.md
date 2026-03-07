# 0002 Authentication And Identity Model

- Status: Accepted
- Date: 2026-03-04

## Context

The product has distinct actors with different access patterns: tenant staff using the admin web, drivers using the driver PWA, and internal platform operators who must not share the same tenant-scoped identity model.

## Decision

- Maintain separate identity classes:
  - Tenant staff accounts for admin access.
  - Tenant driver accounts for driver workflows.
  - Platform accounts reserved for internal operations and excluded from tenant-facing apps.
- Issue JWT access tokens with at least `sub`, `tenant_id`, `role`, `actor_type`, `iat`, and `exp`.
- Hash passwords with Argon2id.
- Add rate limiting to login, password reset, and any future verification endpoints.
- Keep tenant staff and drivers tenant-scoped; platform accounts live outside tenant-scoped app flows.
- Reject any token whose `tenant_id` does not match the resolved tenant.

## Alternatives

- One shared user table for every identity type:
  - Simpler at first, but blurs behavior and authorization boundaries.
- Session-only authentication:
  - Less suitable for API-first and PWA flows.
- Password hashing with bcrypt:
  - Acceptable, but Argon2id is preferred for new systems.

## Consequences

- Positive:
  - Clear role boundaries and cleaner authorization rules.
  - Better fit for mobile and web clients.
  - Stronger password handling baseline.
- Negative:
  - More identity-model documentation and policy work.
  - Platform operators need separate operational tooling.
- Operational:
  - Auth logs, token issuance, and rate-limit telemetry become mandatory security signals.
