---
name: playwright-smoke-tests
description: Execute browser smoke testing for Fleet Fuel Monitoring UI using Playwright MCP. Use when QA or monitoring agents must verify tenant login, dashboard shell/navigation, admin dashboard widgets and tables, and driver PWA critical actions by direct browser observation before reporting health or regressions.
---

# Playwright Smoke Tests

## Purpose

Run fast, repeatable browser smoke checks for critical Fleet Fuel Monitoring workflows.

Report only what is confirmed in the browser session.

## Required Tooling

Use Playwright MCP for any UI verification task in this skill.

Do not mark behavior as working unless it was observed during the current run.

## Smoke Test Workflow

1. Resolve environment target
- Identify tenant base URL from subdomain.
- Confirm the page under test before interacting.

2. Execute tenant login checks
- Open tenant login page and verify it loads.
- Confirm login form controls are visible: email or username field, password field, and sign-in button.
- Attempt valid login when credentials are available.
- Verify successful login navigates to the tenant dashboard.

3. Execute dashboard shell and navigation checks
- Confirm dashboard shell renders (header, content container, and sidebar).
- Verify sidebar visibility and responsive behavior.
- Click sidebar links and confirm each route loads the intended module page.
- Confirm critical pages render without obvious breakage (missing layout blocks, collapsed content, blocking UI errors).

4. Execute admin dashboard checks
- Confirm KPI cards render.
- Confirm data tables load expected columns.
- Confirm table filters are visible and interactive.
- Navigate across admin sections and verify route transitions succeed.

5. Execute driver PWA checks
- Confirm main driver actions are accessible from the primary screen.
- Verify primary action buttons are large and clearly visible.
- Confirm receipt photo capture controls appear where required.
- Confirm odometer capture input appears on the expected workflow step.

6. Stop or continue based on instruction
- If a login page appears unexpectedly during other checks, report it immediately and stop when instructed.
- Escalate deeper failures for investigation after logging smoke-level evidence.

## Behavior Rules

- Distinguish confirmed observations from assumptions.
- Use explicit language: `Observed`, `Not observed`, `Unable to verify`.
- Do not infer backend correctness from UI presence alone.
- Prefer small, frequent smoke passes over large infrequent runs.
- Prioritize navigation, rendering, and interaction basics first.

## Failure Reporting Template

For each failed check, report:
- `Page tested`: exact page or route
- `Action attempted`: user action performed
- `Observed behavior`: what happened in browser
- `Possible visible cause`: likely cause only if directly suggested by visible UI evidence

Use this concise format:

```text
Smoke Failure
Page tested: <page/route>
Action attempted: <action>
Observed behavior: <fact from browser>
Possible visible cause: <optional, evidence-based>
```

## Completion Output

Return a smoke summary with:
- Scope tested (tenant/authenticated/admin/driver PWA)
- Passed checks
- Failed checks
- Blocked checks (and why)
- Explicit callouts for any assumptions or unverified areas
