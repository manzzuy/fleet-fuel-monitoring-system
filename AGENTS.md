# AGENTS

## Project Mission

Build a production-grade multi-tenant Fleet Fuel Monitoring SaaS for admin users and field drivers.

## Non-Negotiable Rules

- Tenant is determined from subdomain only.
- Never trust `tenant_id` from the client.
- All DB queries must be tenant-scoped.
- JWT tenant context must match resolved tenant context.
- No cross-tenant access ever.
- No quick hacks.
- No design invention for workflow-changing UI without design guidance.
- Driver flows must remain mobile-first and field-usable.

## Monorepo Awareness

- `apps/` contains deployable applications.
- `apps/api` owns backend service logic and persistence.
- `apps/admin-web` owns the admin SaaS interface.
- `apps/driver-pwa` owns the driver mobile interface.
- `packages/` contains shared code and reusable modules.
- `packages/` contains shared utilities, types, and UI components.
- Shared packages must remain generic and must not contain app-specific logic.
- Cross-app changes must preserve clear boundaries and explicit ownership.
- UI workflow-changing features should reference `docs/ui/<page>.md` when applicable.

## Workflow

Product Owner → Architect + Designer → Backend / Frontend in parallel → QA → Security → Monitor when needed

## Definition Of Done

- Scope is defined.
- Architecture impact is documented if changed.
- UX/spec references are updated if UI changed.
- DB changes are reviewed.
- Tests are added or updated.
- QA validation is performed.
- Security is reviewed where relevant.
- Docs are updated.
