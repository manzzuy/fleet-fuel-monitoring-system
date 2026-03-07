# 0006 Fuel Event Model

- Status: Accepted
- Date: 2026-03-06

## Context

The platform records fueling activity for vehicles and site tanks. These events are related but not identical. The system also requires auditability for receipts, odometer capture, and future reconciliation/reporting.

## Decision

- Fuel events are recorded in `FuelLog` using a controlled `source_type`.
- Allowed source types must be controlled, not free-form.
- Initial allowed source types:
  - `station`
  - `tank`
  - `approved_source`
- If `approved_source` is used, additional descriptive context is required.
- Vehicle fueling and tank fueling must remain operationally distinct event types even if they share a common log model.
- `FuelLog` must preserve auditability, including source_type, liters, cost when available, timestamp, actor/driver context, vehicle or tank context as applicable, and receipt evidence when required.
- Odometer should be captured when applicable to vehicle fueling, with explicit fallback behavior when missing.
- Tank-related events must support inventory/audit workflows and must not be conflated with station-based receipt logic.

## Alternatives

- Free-form source labels
- Separate unrelated tables for each fuel event type
- Single generic event with no enforced source typing

## Consequences

- Positive:
  - cleaner validation
  - better reporting
  - stronger auditability
  - easier fraud/misuse analysis later
  - clearer workflow branching
- Negative:
  - slightly more modeling discipline required
  - `approved_source` requires explicit governance

## Operational Notes

- Validation rules differ by `source_type`.
- Receipt requirements may differ by `source_type`.
- Downstream reporting and reconciliation should treat `source_type` as first-class.
- Future expansions must add approved source types intentionally, not ad hoc.
- All FuelLog writes and reads remain tenant-scoped; no cross-tenant access is permitted.
