# 0003 API Structure And Error Format

- Status: Accepted
- Date: 2026-03-04

## Context

The system needs consistent backend behavior across admin and driver clients. Inconsistent route design, logging, or error handling increases coupling and slows delivery.

## Decision

- Use REST-style HTTP APIs under a versioned prefix such as `/v1`.
- Group routes by bounded module, not by UI screen.
- Use the error format:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Request validation failed.",
    "details": {}
  }
}
```

- Assign every request a `request_id` and echo it in the response header.
- Log structured events with request metadata, tenant context where safe, and outcome.
- Keep successful responses unwrapped unless a list or pagination envelope is needed.

## Alternatives

- GraphQL:
  - Flexible, but unnecessary for the current phase and adds operational complexity.
- UI-specific endpoints:
  - Faster initially, but increases coupling and rework.
- Ad hoc error payloads:
  - Rejected because they weaken client consistency and observability.

## Consequences

- Positive:
  - Predictable contracts for all clients.
  - Better debugging with request correlation.
  - Cleaner module ownership.
- Negative:
  - Requires discipline around response design and logging standards.
- Operational:
  - API reviews must reject inconsistent route naming, missing request IDs, or non-standard errors.
