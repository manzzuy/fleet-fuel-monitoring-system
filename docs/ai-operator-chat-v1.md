# AI System Operator Chat v1

## Purpose
Internal troubleshooting assistant for Platform Owner and operations staff.  
This is not a customer chatbot and does not execute autonomous fixes.

## v1 Architecture
1. **Operator Chat UI** (`apps/admin-web/components/platform-console.tsx`)
   - New "AI System Operator Chat (v1)" panel in Platform Owner console.
   - Accepts natural-language question.
   - Shows structured output:
     - likely cause
     - evidence
     - affected service(s)
     - likely modules/files
     - next checks
     - risk + confidence
2. **Operator Assist API** (`POST /platform/operator/assist`)
   - Platform-owner auth only (`platformAuthMiddleware`).
   - Request parser validates question shape.
   - Returns deterministic structured response for operational triage.
3. **Retrieval + Diagnosis Service** (`apps/api/src/services/operator-assistant.service.ts`)
   - Retrieves system-memory docs.
   - Classifies question intent for v1 supported question set.
   - Extracts evidence snippets from source docs by keyword scoring.
   - Maps intent to affected services + likely modules + next checks.
   - Includes safe status snapshot (`database reachable/unreachable`).

## v1 Retrieval and Context Strategy
### Sources used in v1
- `docs/system-memory/platform-state.md`
- `docs/system-memory/architecture-decisions.md`
- `docs/system-memory/ui-decisions.md`
- `docs/system-memory/deployment-history.md`
- `docs/system-memory/known-issues.md`
- `docs/system-memory/checklist-evolution.md`
- `docs/system-memory/onboarding-evolution.md`
- `docs/system-memory/dashboard-evolution.md`
- `docs/system-memory/system-health.md`
- service/module map hints in code for API/admin/driver paths

### Retrieval behavior
- Rule-based intent classification for pilot-safe determinism.
- Doc snippet scoring using question and intent keywords.
- Prefer intent-relevant docs, return top evidence snippets with paths.
- Confidence increases with amount/quality of evidence.
- Marks answer as `uncertain` when evidence is weak.

## Supported Question Set (v1)
1. Why did tenant onboarding fail?
2. Why is this driver not seeing a vehicle?
3. Why is missing daily checks showing 0?
4. What changed in the last deployment?
5. Is this a known issue?
6. Which service should I inspect first?

## v1 Answer Contract
- `likely_cause`
- `evidence[]`
- `affected_services[]`
- `likely_modules[]`
- `known_previous_incidents[]`
- `recent_relevant_changes[]`
- `next_checks[]`
- `risk_level`
- `confidence`
- `uncertain`
- `status_snapshot`

## Deferred to v2
- Real-time Railway logs ingestion inside chat responses.
- Automatic commit/deploy remediation from chat.
- Cross-service trace correlation and anomaly timeline.
- Vector retrieval/index over codebase + incidents.
- Tenant-specific metrics query execution in chat.

## Example Operator Q&A Flows
### Q1
**Question:** "Why did tenant onboarding fail?"

**v1 output pattern:**
- likely cause: validation/migration/data-state issue
- affected services: api, admin-web, database
- likely modules: onboarding service + platform console
- next checks: preflight, preview errors, request_id logs, staging data hygiene

### Q2
**Question:** "Why is missing daily checks showing 0?"

**v1 output pattern:**
- likely cause: dashboard aggregation/date-range/scope mismatch
- affected services: api, admin-web, database
- likely modules: dashboard service + dashboard shell
- next checks: compare raw submissions vs KPI window, verify scope filters

### Q3
**Question:** "Which service should I inspect first?"

**v1 output pattern:**
- likely cause: depends on symptom class
- evidence from known incidents and deployment history
- next checks ordered by transport/data/UI/deploy triage path

## Pilot Risks and Limitations
- Rule-based diagnosis can miss edge cases without fresh logs.
- Accuracy depends on system-memory docs being maintained after incidents.
- Not a replacement for direct API/log/Playwright verification.
- Should be used as triage guidance, not as final production truth.

## Implementation Plan (Delivered v1)
1. Add platform-auth operator-assist endpoint.
2. Add retrieval/intent service over system-memory docs.
3. Add platform console chat panel and structured rendering.
4. Add API tests for auth + supported/uncertain responses.
5. Keep all behavior non-destructive and read-only.
