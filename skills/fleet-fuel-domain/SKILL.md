---
name: fleet-fuel-domain
description: Define and enforce core Fleet Fuel Monitoring domain rules, entity relationships, and tenant isolation constraints for a multi-tenant SaaS. Use when making architecture decisions, designing backend schemas and APIs, planning QA coverage, reviewing product workflows, or evaluating security and auditability of fuel-related features.
---

# Fleet Fuel Domain

## Purpose

Apply this skill as the source of truth for domain modeling and decision-making across architecture, backend, QA, security, and product.

## Core Domain Model

Use these entities as the canonical domain surface:
- Tenant
- Site
- Vehicle
- Driver
- FuelLog
- Tank
- FuelCard
- ReceiptPhoto

Model every business entity as belonging to exactly one `Tenant`.

## Entity Relationships

Use these baseline relationships unless a change is explicitly approved:
- `Tenant` owns all `Site`, `Vehicle`, `Driver`, `FuelLog`, `Tank`, `FuelCard`, and `ReceiptPhoto` records.
- `Site` groups operational context for tenant-local fueling operations.
- `Vehicle` may have zero or one assigned `Driver` at a point in time, while shared/unassigned workflows remain valid.
- `FuelLog` records one fueling event and links to either a vehicle-fueling context or a tank-fueling context.
- `Tank` supports site-level fuel inventory workflows and must not be conflated with vehicle events.
- `FuelCard` is tenant-scoped payment/audit context for fueling.
- `ReceiptPhoto` is evidence attached to a `FuelLog` and must be stored and validated safely.

## Non-Negotiable Domain Rules

Enforce these rules in architecture, APIs, services, background jobs, and tests:
- Resolve tenant context from subdomain only.
- Never accept or trust `tenant_id` from client-controlled input.
- Scope all site and tank operations to the resolved tenant.
- Keep vehicle fueling and tank fueling as separate event types; never mix them in one event flow.
- FuelLog must record a clear source type, such as station, tank, or another explicitly approved source.
- Allowed source types must be controlled rather than free-form.
- If an approved fallback source type is used, require additional descriptive context.
- Preserve `FuelLog` auditability with liters, cost, timestamp, driver, vehicle, source, and receipt evidence when required.
- Capture odometer when available; support explicit recovery flows when odometer is missing.
- Support both assigned-driver and shared/unassigned vehicle workflows without weakening audit trails.
- Validate and store receipt photos as audit evidence using safe storage and input validation controls.
- Reject any cross-tenant workflow or data access pattern.

## Implementation Guidance

Use these defaults in design and review:
- Prefer clear, domain-specific naming over generic labels.
- Model source type as a controlled enum/value set; avoid free-text source fields for canonical records.
- Preserve immutable audit history for fuel events and evidence metadata.
- Treat tenant isolation constraints as hard boundaries, not configurable options.
- Escalate ambiguous flows instead of adding shortcuts that bypass domain safeguards.

## QA and Review Checklist

Verify each change against this checklist:
- Tenant context derives from subdomain and is enforced end-to-end.
- No endpoint, job, or query accepts client-provided tenant identity.
- Fuel event type separation (vehicle vs tank) is tested and guarded.
- FuelLog source types are validated against an approved controlled set.
- Fallback source type usage requires descriptive context and is test-covered.
- Fuel logs retain complete audit fields and evidence links.
- Missing-odometer recovery behavior is defined and test-covered.
- Receipt photo validation and storage safety checks are present.
- No scenario permits cross-tenant read/write access.
