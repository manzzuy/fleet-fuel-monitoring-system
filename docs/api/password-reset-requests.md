# Password Reset Requests (Tenant Governance)

## User-facing request endpoint

`POST /auth/request-password-reset?tenant=<subdomain>`

Request body:

```json
{
  "identifier": "username-or-email"
}
```

Response is always generic:

```json
{
  "accepted": true,
  "message": "Your request has been submitted for review."
}
```

Notes:
- The response does not disclose whether the user exists.
- A tenant-scoped `password_reset_requests` record is created for review.

## Tenant admin review endpoints

All endpoints below require tenant staff auth and full-tenant scope.
Allowed roles: `TRANSPORT_MANAGER`, `TENANT_ADMIN`.

### List requests

`GET /tenanted/password-reset-requests`

Optional query:
- `status`: `PENDING | APPROVED | REJECTED | COMPLETED`
- `role`
- `site_id`
- `from`, `to` (`YYYY-MM-DD`)

### Approve request

`POST /tenanted/password-reset-requests/:id/approve`

Body:

```json
{
  "notes": "optional review note"
}
```

On approve:
- temporary password is generated
- target account password is reset
- `force_password_change` is enabled
- request status becomes `APPROVED`
- audit event is written

### Reject request

`POST /tenanted/password-reset-requests/:id/reject`

Body:

```json
{
  "notes": "required rejection reason"
}
```

On reject:
- request status becomes `REJECTED`
- reviewer metadata is captured
- audit event is written
