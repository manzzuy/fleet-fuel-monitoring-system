# Phase 3.x Deferred Hardening Tracker

These items are non-blocking for Phase 3 MVP completion and should be scheduled in Phase 3.x hardening.

## Deferred Items

### P3H-001 Checklist submit idempotency / replay protection
- Area: API / Security
- Need: Prevent duplicate checklist submit side effects and define deterministic replay handling.
- Exit criteria: Repeat submits for the same payload are safely handled and documented.

### P3H-002 Fuel submit idempotency / replay protection
- Area: API / Security
- Need: Prevent accidental duplicate fuel submissions from retries or unstable connectivity.
- Exit criteria: Duplicate submit controls implemented and tested on driver fuel write path.

### P3H-003 Per-route write rate limiting for driver endpoints
- Area: API / Security
- Need: Add write-path protection on driver submit/upload endpoints.
- Exit criteria: Rate limits enforced on key driver write routes with clear error responses.

### P3H-004 Receipt access/storage hardening
- Area: Storage / Security
- Need: Review receipt storage and retrieval controls, including access policy and retention approach.
- Exit criteria: Receipt access policy documented and enforced for tenant-safe retrieval.

### P3H-005 Minor Driver UX polish
- Area: UX / Frontend Driver
- Need: Improve small field-usability details without changing core workflow ownership.
- Exit criteria: Priority UX polish items are listed, implemented, and regression-tested.
