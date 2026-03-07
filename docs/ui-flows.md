# UI Flows

## 0) Unified Tenant Auth Flow (Admin + Driver Surfaces)

1. User opens a tenant host (`{subdomain}.platform.test`).
2. Client submits credentials to `POST /auth/login`.
3. Tenant is resolved from host/subdomain only.
4. Identity is resolved within tenant scope and token is issued with explicit actor context.
5. Surface guard routes by actor type/role:
   - Admin UI permits staff/admin roles only.
   - Driver PWA permits driver role only.

Failure/Recovery:
- Invalid credentials: inline error with retry.
- Tenant mismatch: hard stop with clear context message.
- Actor/surface mismatch: deny access and route to the correct login surface.

## 1) Admin Login → Dashboard Shell → Module Navigation

1. User opens tenant-scoped admin host.
2. Login validates credentials and tenant context.
3. Dashboard shell loads with sidebar navigation.
4. User navigates modules from sidebar.

Failure/Recovery:
- Invalid credentials: inline error with retry.
- Tenant mismatch: hard stop with clear context message.
- Partial module load failure: isolate module error; keep shell usable.

## 2) Driver Fuel Submission Flow

1. Driver opens fuel submission screen.
2. Vehicle/context defaults load if available.
3. Driver selects `source_type` from controlled values only:
   - `station`
   - `tank`
   - `card`
   - `approved_source`
4. If `approved_source` is selected, driver must enter additional descriptive context before submit.
5. Driver enters odometer/liters with minimal typing.
6. Driver confirms and submits.

Failure/Recovery:
- Validation failure: inline field guidance.
- Network failure: retry path with preserved entered values.
- Duplicate submission risk: explicit state to prevent double-submit.

## 3) Receipt Capture Flow

1. Driver starts receipt capture from fuel flow.
2. Camera capture opens first.
3. Preview shown with retake or continue.
4. Upload/attach confirmation shown.

Failure/Recovery:
- Camera denied: fallback upload guidance.
- Upload failed: retain media context and offer retry.
- Interrupted flow: return with preserved pending state.

## 4) Odometer Capture With Fallback Flow

1. Driver enters odometer via numeric keypad.
2. Client validation runs immediately.
3. On success, proceed to next step and persist value as auditable entry input.
4. If odometer is unavailable, driver must use explicit fallback path with required reason/context.
5. On invalid value, show corrective guidance and keep entry context.

Failure/Recovery:
- Missing value: block submit with concise hint.
- Out-of-range/policy issue: actionable message, no silent reject.
- Fallback used: mark submission as fallback and persist reason for audit review.

## 5) Import Preview → Validation → Commit Flow

1. Platform operator selects tenant/company.
2. Upload workbook.
3. Preview shows row-level errors/warnings by sheet.
4. Commit is enabled only when blocking errors are zero.
5. Commit writes auditable result summary.

Failure/Recovery:
- Header/schema mismatch: show exact sheet/column issue.
- Referential mismatch: show row-level references that failed.
- Commit failure: show request_id and safe retry guidance.

## 6) Module-Level State Expectations

Each flow above must define and render:
- Loading state (layout-preserving)
- Empty state (with next action)
- Success state (confirmation + next action)
- Error state (what failed + retry path)
