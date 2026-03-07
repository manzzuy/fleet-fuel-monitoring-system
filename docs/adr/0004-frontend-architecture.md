# 0004 Frontend Architecture

- Status: Accepted
- Date: 2026-03-04

## Context

The product includes an admin web application and a driver PWA with different interaction models but shared tenancy rules and shared contract dependencies.

## Decision

- Use separate Next.js apps for admin and driver surfaces.
- Keep shared types, zod schemas, and host-parsing utilities in a shared package.
- Organize frontend code by route segment and domain module, not by raw component type alone.
- Require admin and driver implementations to follow design-system rules and page specs before UI buildout.
- Keep tenant context derived from host and propagated through approved API calls only.
- Avoid storing cross-tenant data in client-side caches, offline storage, or URLs.

## Alternatives

- One combined frontend app:
  - Lower initial setup, but mixes two very different UX models.
- Duplicate shared types into each app:
  - Faster short term, but creates drift.
- Feature-first UI invention without specs:
  - Rejected because it causes UX inconsistency and rework.

## Consequences

- Positive:
  - Clear ownership by surface.
  - Shared contracts stay centralized.
  - Driver PWA and admin web can evolve at different speeds.
- Negative:
  - Requires discipline to avoid divergence in shared patterns.
- Operational:
  - New pages require page specs, tenancy-safe data fetching, and predictable state behavior.
