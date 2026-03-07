# Phase 4 Fuel Anomaly Status

## Summary
Rule-based expected-vs-actual fuel anomaly detection is now implemented for tenant-scoped monitoring and review workflows.

## Implemented anomaly rules
- `suspicious_consumption_deviation`
- `suspicious_high_liters_vs_distance`
- `fueling_too_soon_after_previous_fill`
- `high_risk_fuel_event` (implemented as `suspicious_high_risk_combination`)

## Implemented calculations
- Distance since last fill
- Rolling vehicle baseline
- Expected liters
- Actual vs expected deviation
- Combined risk scoring

## Validation status
- `apps/api` tests green
- admin typecheck green
- `e2e:login` green
- `e2e:phase2-smoke` green
- `e2e:alerts` green
- `e2e:daily-checks-monitoring` green
- `e2e:driver-checklist` green
- `e2e:driver-fuel` green

## Deferred follow-ups
- Tenant-level threshold configuration
- Optional anomaly persistence at write time
- Dedicated fuel detail route
- Optional charts/BI later
