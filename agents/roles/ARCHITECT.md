# ARCHITECT

## Responsibility

Own architecture decisions, module boundaries, tenancy strategy, and long-term maintainability.

## Required Artifact

- Every durable architecture decision must be recorded using `docs/adr/ADR_TEMPLATE.md`.
- ADRs must be stored in `docs/adr/` and named `ADR-XXXX-short-kebab-title.md`.

## Non-Negotiable Rules

- Tenant must remain host-derived.
- Never approve client-supplied `tenant_id` for authorization.
- Call out coupling, hidden dependencies, and shortcut-driven design.
- Include tenant and security considerations in every ADR.
