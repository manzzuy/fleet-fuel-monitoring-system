# Design System

## Foundations (Admin + Driver)

### Typography
- Use a consistent scale: 12 / 14 / 16 / 20 / 24 / 32.
- 14–16 for body and controls, 20–24 for section/page titles.
- Use concise, neutral operational language.

### Spacing
- Base spacing scale: 4 / 8 / 12 / 16 / 24 / 32 / 48.
- Keep dense operational layouts predictable; avoid arbitrary spacing.

### States (Required Everywhere)
- Empty
- Loading
- Success
- Error
- Permission/blocked state when relevant

### Interaction Standards
- Hover/focus/active states must be visible and consistent.
- Default transition target: ~180–220ms, subtle and purposeful.
- Never hide workflow-critical actions behind ambiguous controls.

---

## Admin Dashboard Design System

### Sidebar
- Left sidebar supports expanded/collapsed states.
- Collapse animation should be smooth, not abrupt.
- Collapsed mode retains icon recognizability and discoverable labels/tooltips.
- Content reflow must be stable during collapse/expand.

### KPI Cards
- KPI cards are clickable only when they route to a real filtered/drilldown destination.
- Hover state: light elevation/border emphasis.
- Active/selected state must be distinct from hover.
- Loading state uses skeleton placeholders preserving card dimensions.

### Filterable Tables
- Filters are visible and labeled.
- Reset behavior is explicit.
- Sorting direction is visible.
- “No data” and “No filter match” states are distinct.

### Section Layout Grid
- Desktop/tablet grid with predictable gutters.
- Information hierarchy: KPI row → operational tables/panels → secondary context.
- Reusable page-shell pattern across admin modules.

### Alerts / Banners
- Neutral, action-oriented language.
- Severity style is clear without alarmist wording.
- Banner copy should include: what happened, impact, next action.

### Reusable Rules
- Card shell: title, content region, state region.
- Table shell: header, row body, empty/loading/error rows.
- Filter shell: criteria, apply/reset, state echo.

---

## Driver PWA Design System

### Auth and Session Boundary
- Use the tenant-scoped unified login transport (`POST /auth/login`) for driver sign-in.
- Tenant context is derived from host/subdomain only; no client-supplied tenant identifier is allowed.
- Driver sessions must carry explicit actor context and must be rejected on admin-only surfaces.

### Primary Actions
- Large primary buttons.
- Minimum tap target: 44px x 44px.
- Primary action remains easy to reach for one-hand use.

### Input Friction
- Minimal typing.
- Prefer pickers, defaults, recent values, and numeric keypad input.
- Numeric-first fields (odometer/liters) should prefer numeric keyboards.

### Camera-First Receipt Flow
- Capture is the default path.
- Show immediate preview with retake/continue.
- Upload failure provides explicit retry with preserved context.

### Odometer Ergonomics
- Fast single-flow entry with clear validation and fallback guidance.
- Show previous value for confidence where safe.
- Validation messaging must be short and actionable.
- Fallback path must be explicit, require reason/context, and remain auditable.

### Fuel Source Type Rules
- Fuel entry must require `source_type` selection from a controlled set:
  - `station`
  - `tank`
  - `card`
  - `approved_source`
- Free-form source labels are not allowed.
- If `approved_source` is selected, additional descriptive context is required before submit.

### Field Conditions
- High readability in glare conditions.
- High contrast for critical controls.
- Avoid small dense controls on core driver screens.

### Resilience
- Explicit interruption/retry behavior for weak connectivity.
- Offline-awareness messaging must be clear and non-blocking when possible.
- Success/error feedback must be immediate and unambiguous.
