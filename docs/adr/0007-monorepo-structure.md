# 0007 Monorepo Structure

- Status: Accepted
- Date: 2026-03-06

## Context

The platform has separate deployable applications for admin, driver, and API surfaces, with shared packages for cross-cutting contracts and utilities. The repository already uses `apps/` and `packages/`.

## Decision

- Use a monorepo structure with:
  - `apps/admin-web`
  - `apps/driver-pwa`
  - `apps/api`
  - `packages/*`
- `apps/` contains deployable applications with clear surface ownership.
- `packages/` contains shared types, schemas, utilities, UI primitives, and other reusable cross-app modules.
- Shared packages must remain generic and must not become a dumping ground for app-specific logic.
- App-specific workflows and business logic should remain in the owning app unless there is clear cross-app justification.
- Shared contracts should be versioned through repository discipline and coordinated changes, not informal copying.
- Frontend and backend contracts should prefer shared typed schemas where appropriate.

## Alternatives

- Separate repositories per app/service
- Single app for admin and driver
- Copy-paste shared contracts into each app

## Consequences

- Positive:
  - easier shared contract management
  - consistent tooling and CI
  - simpler coordinated refactors
  - clearer ownership by surface
- Negative:
  - requires discipline to prevent poor shared-package design
  - build/test tooling can become more complex

## Operational Notes

- `apps/admin-web` owns admin SaaS UX.
- `apps/driver-pwa` owns driver mobile/PWA UX.
- `apps/api` owns backend service logic and persistence behavior.
- `packages/` should be reviewed carefully before adding new modules.
- Cross-app changes should preserve tenancy boundaries and explicit ownership.
