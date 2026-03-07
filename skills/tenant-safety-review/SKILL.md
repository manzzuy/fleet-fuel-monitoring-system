---
name: tenant-safety-review
description: Enforce tenant isolation as a hard security boundary for Fleet Fuel Monitoring. Use when reviewing or implementing architecture, backend APIs/services, security controls, QA test plans, data import/export flows, background jobs, caching, file uploads, and reporting queries in the multi-tenant SaaS.
---

# Tenant Safety Review

## Purpose

Apply this skill to prevent cross-tenant data exposure and enforce tenant-safe design decisions across architecture, backend, security, QA, and data import workflows.

## Non-Negotiable Rules

Enforce all rules below without exception:
- Resolve tenant from subdomain only.
- Never accept or trust `tenant_id` from client input.
- Scope every database query to tenant context unless resolving tenant itself.
- Require JWT tenant context to match resolved tenant context.
- Block cross-tenant reads, writes, joins, exports, and imports.
- Assign tenant ownership during import inside trusted server code.
- Preserve tenant context in logs and audit trails where appropriate.
- Partition shared cache keys by tenant to prevent leakage.
- Validate tenant ownership before associating uploaded files.

## Review Workflow

1. Resolve tenant boundary
- Verify tenant is derived from request subdomain.
- Verify request/session context stores resolved tenant in trusted server state.

2. Validate auth and JWT coupling
- Confirm JWT tenant claim is checked against resolved tenant context.
- Reject or fail closed on mismatch.

3. Inspect data access paths
- Check repositories/services/ORM queries for tenant filters.
- Confirm joins, aggregates, exports, and reports remain tenant-scoped.
- Confirm background jobs receive and enforce tenant context.

4. Inspect integration surfaces
- Verify cache keys include tenant partitioning.
- Verify file upload association enforces tenant ownership.
- Verify imports assign tenant ownership internally and never from client payload.

5. Confirm test and audit coverage
- Require QA cases for cross-tenant denial paths.
- Require tests for tenant mismatch, missing tenant filters, and tenantless job execution.
- Confirm audit records preserve tenant context for traceability.

## Red Flags

Treat each red flag as a security finding until fixed:
- Missing tenant filters.
- Trusting client payload `tenant_id`.
- Admin endpoints without tenant checks.
- Shared caches without tenant partitioning.
- Exports or uploads without tenant ownership validation.
- Background jobs running without tenant context.
- Report queries that aggregate across tenants unintentionally.

## Required Response Behavior

When using this skill:
- Identify tenant boundary risks explicitly and name the affected component.
- Recommend concrete fixes with implementation direction, not generic warnings.
- Treat tenant isolation as a hard security boundary in all tradeoffs.
- Keep language concise, production-oriented, and audit-friendly.

## Fix Patterns

Use these fix patterns when issues are found:
- Missing query filter: add mandatory `tenant_id = resolvedTenantId` scope in repository/service layer and enforce via shared guard/helper.
- Client-provided tenant input: remove `tenant_id` from API contracts; derive from resolved request context only.
- JWT mismatch risk: add explicit equality check between JWT tenant claim and resolved tenant; deny on mismatch.
- Tenantless background job: require `tenantId` in job payload from trusted scheduler and re-validate at execution start.
- Cache leakage risk: prefix keys with stable tenant namespace (for example `tenant:{tenantId}:...`).
- Import ownership risk: stamp tenant ownership server-side during transformation/persistence.
- Upload association risk: verify target record belongs to resolved tenant before linking file metadata.
- Cross-tenant reporting risk: enforce tenant where-clause before group/aggregate logic and validate with negative tests.

## Output Template

Use this format for reviews:
- Finding: `<short risk title>`
- Severity: `<high|medium|low>`
- Evidence: `<endpoint/query/job/cache/upload/report path>`
- Impact: `<cross-tenant exposure/corruption risk>`
- Fix: `<specific implementation change>`
- Validation: `<tests or checks to add>`
