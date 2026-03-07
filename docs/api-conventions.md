# API Conventions

## Base Rules

- Use REST endpoints under a versioned prefix such as `/v1`.
- Group routes by domain module, not by page name.
- Use nouns for resources and explicit verbs only for actions that are not plain CRUD.
- Tenanted endpoints require resolved tenant context before business handlers run.

## Route Naming

- Examples:
  - `GET /v1/vehicles`
  - `POST /v1/drivers`
  - `POST /v1/auth/login`
  - `POST /v1/fuel-entries`
  - `POST /v1/daily-checks`
- Avoid mixed naming styles inside the same module.
- Do not place `tenant_id` in route paths for tenant-owned resources.

## Pagination And Filtering

- Default list pagination should use explicit query params:
  - `page`
  - `page_size`
  - `sort`
  - `order`
- Filters should use descriptive query params such as:
  - `status=active`
  - `vehicle_id=<uuid>`
  - `from=2026-03-01`
  - `to=2026-03-31`
- Filter params refine tenant-owned data only after tenant resolution is complete.

## Error Format

All non-success responses use:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Request validation failed.",
    "details": {}
  }
}
```

`details` is optional and typically contains validation metadata.

## Success Responses

- Return plain resource payloads for simple reads and writes.
- Use a list envelope when pagination metadata is required.

Example paginated response:

```json
{
  "items": [],
  "page": 1,
  "page_size": 25,
  "total": 0
}
```

- Do not wrap every successful response in a generic `data` envelope unless a future cross-cutting need is approved by ADR.

## Auth Header

Authenticated endpoints use:

```http
Authorization: Bearer <access-token>
```

The access token currently contains `sub`, `tenant_id`, `role`, and `actor_type`.

## Request ID

- Every request receives an `x-request-id` response header.
- Clients may provide `x-request-id`; the API preserves it when valid.
- Logs, async jobs, and downstream service calls should propagate it where practical.
- Request logs include `request_id`, status code, duration, and resolved tenant when available.

## Logging

- Use structured logs.
- Include at least:
  - `request_id`
  - method
  - route
  - status code
  - duration
  - resolved tenant context where safe
- Never log raw passwords, tokens, or sensitive file content.
