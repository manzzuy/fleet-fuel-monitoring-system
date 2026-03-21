# Pilot Access Handover (Maqshan)

## Role Login Matrix
| Role | App | URL | Login method | First-login behavior |
|---|---|---|---|---|
| Driver | Driver PWA | `https://fleet-fueldriver-pwa-production.up.railway.app/?tenant=maqshan` | Username + temporary password | Forced to `/change-password` when `force_password_change=true` |
| Safety Officer | Admin Web | `https://fleet-fueladmin-web-production.up.railway.app/?tenant=maqshan` | Username + temporary password | Forced to `/change-password` before dashboard access |
| Site Supervisor | Admin Web | `https://fleet-fueladmin-web-production.up.railway.app/?tenant=maqshan` | Username + temporary password | Forced to `/change-password` before dashboard access |
| Transport Manager / Admin | Admin Web | `https://fleet-fueladmin-web-production.up.railway.app/?tenant=maqshan` | Username + temporary password | Forced to `/change-password` before dashboard access |

## Password Flows
### 1) First login password change (mandatory)
1. User signs in with temporary password.
2. API returns token claim `force_password_change=true`.
3. Admin/Driver app redirects to `/change-password`.
4. User must update password before app routes are accessible.
5. API stores new password hash and sets `force_password_change=false`.

### 2) Admin-initiated reset
1. Transport Manager (or permitted tenant admin scope) opens `Users`.
2. Select target user and click `Reset password`.
3. System generates a temporary password server-side.
4. API marks `force_password_change=true`.
5. Password reset action is written to `audit_logs`.

## User-Initiated Reset Request (pilot-safe)
1. User opens tenant login page.
2. Submits identifier in **Request password reset**.
3. API always returns accepted message (does not reveal account existence).
4. API writes `PASSWORD_RESET_REQUESTED` audit event.
5. Tenant management team performs admin-initiated reset.

## Security Controls
- No raw passwords are committed to code.
- Reset requests do not disclose user existence.
- Reset and support reset both force password change.
- Audit trail includes reset requests and reset actions.
- Tenant resolution and tenant isolation remain unchanged.
