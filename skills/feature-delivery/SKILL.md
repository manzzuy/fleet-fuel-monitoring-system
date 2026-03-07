---
name: feature-delivery
description: Standardize implementation of Fleet Fuel Monitoring features through a required multi-stage workflow across Product, Architecture, Design, Backend, Frontend, QA, and Security. Use when planning, implementing, reviewing, or completing any feature change so delivery stays tenant-safe, test-backed, documented, and production-ready.
---

# Feature Delivery

## Purpose

Use this skill to deliver features with a consistent, production-grade process.

Enforce structured execution, detect skipped stages, and require correction before claiming completion.

## Required Workflow

Execute every feature in this order:

1. Product Owner
- Define clear feature goal, scope, and acceptance criteria.
- Block implementation when goal or scope is ambiguous.

2. Architect
- Review system impact, module boundaries, and tenancy implications.
- Verify tenant isolation remains intact and no cross-tenant path is introduced.

3. Designer UI/UX (when UI changes are involved)
- Define user flows, states, and page-level specs.
- Block UI implementation when workflow-changing UI lacks design guidance.

4. Backend
- Define API contracts, service logic, and database updates.
- Enforce tenant-safe data access and auth coupling.
- Reject convenience shortcuts that bypass tenant safeguards.

5. Frontend
- Implement behavior from approved design specs and API contracts.
- Preserve defined workflows; avoid undocumented UX invention.

6. QA
- Validate acceptance criteria, critical user flows, and regression coverage.
- Require negative-path checks for tenancy, auth, and validation when relevant.

7. Security
- Review tenant isolation and sensitive operations.
- Confirm no auth, data exposure, or privilege boundary regressions.

## Required Artifacts

Require these artifacts per feature as applicable:
- Feature document based on `docs/feature-template.md`.
- Architecture notes when domain or module boundaries change.
- Updated design references when UI changes.
- API endpoint definitions.
- Database migration notes when schema changes.
- QA test coverage and validation outcomes.
- Security considerations for tenant isolation and sensitive operations.

## Enforcement Rules

Apply these rules without exception:
- Do not begin implementation without a clearly defined goal.
- Do not implement workflow-changing UI without design guidance.
- Do not bypass tenant safety checks in backend logic.
- Do not mark a feature complete before QA validation.
- Keep feature documentation aligned with final behavior.

## Response Behavior

When using this skill:
- Drive structured delivery instead of ad-hoc coding.
- Detect missing steps or artifacts and call them out explicitly.
- Recommend returning to earlier stages when prerequisites are missing.
- Keep guidance concise, implementation-oriented, and production-safe.

## Completion Gate

Treat a feature as complete only when all are true:
- Required workflow stages are executed.
- Required artifacts are present and updated.
- Tenant isolation constraints are preserved and verified.
- QA and security checks pass for applicable risk areas.
