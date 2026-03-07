# Phase 2 Deferred Issues

Phase 2 core functionality for the tenant admin dashboard is complete.  
The issues listed here are non-blocking and intentionally deferred for Phase 2.x or later.  
Do not pull these items into Phase 3 core scope unless they directly affect driver workflows or tenant safety.

## Deferred Items

### ID: P2-DEF-001
- Area: dashboard
- Issue: KPI cards do not auto-refresh after background data changes unless the page is manually reloaded.
- Impact: low
- User impact: Users may see stale counts until refresh or re-navigation.
- Workaround: Manually reload the dashboard page.
- Target phase: 2.x
- Owner: frontend_admin
- Exit criteria: KPI data refreshes automatically on a defined interval or explicit refresh action without full page reload.

### ID: P2-DEF-002
- Area: ux
- Issue: Fuel page filter interactions need clearer affordances for active filters and reset behavior.
- Impact: medium
- User impact: Users may need extra clicks to understand which filters are currently applied.
- Workaround: Use “Clear filters” and reapply filters step-by-step.
- Target phase: 2.x
- Owner: designer_uiux + frontend_admin
- Exit criteria: Active filter state is consistently visible and reset behavior is predictable across all filter controls.

### ID: P2-DEF-003
- Area: module
- Issue: Daily checks table needs additional sorting/filtering polish for faster triage of pending and issue-heavy records.
- Impact: medium
- User impact: Users take longer to find highest-priority records in larger tenant datasets.
- Workaround: Use current date, vehicle, and status filters to narrow results manually.
- Target phase: 2.x
- Owner: frontend_admin
- Exit criteria: Daily checks table supports deterministic sort options and clear prioritization views for pending/issues.

### ID: P2-DEF-004
- Area: module
- Issue: Vehicles monitoring table currently loads a fixed dataset and lacks pagination controls.
- Impact: medium
- User impact: Large fleets can cause slower scans and limited visibility beyond initial rows.
- Workaround: Use search to narrow visible rows.
- Target phase: 3.x
- Owner: backend + frontend_admin
- Exit criteria: Vehicles list supports tenant-scoped pagination with page size and next/previous navigation.

### ID: P2-DEF-005
- Area: ux
- Issue: Sidebar responsiveness at narrow desktop/tablet breakpoints needs minor spacing and alignment polish.
- Impact: low
- User impact: Navigation remains usable but visual consistency drops at some viewport widths.
- Workaround: Use full-width desktop viewport for best experience.
- Target phase: later
- Owner: designer_uiux + frontend_admin
- Exit criteria: Sidebar maintains consistent spacing, hit targets, and label clarity across supported breakpoints.
