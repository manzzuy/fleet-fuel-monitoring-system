---
name: driver-mobile-ux
description: Define UX, ergonomics, and resilience rules for the Fleet Fuel Monitoring driver mobile PWA under real field conditions. Use when designing driver flows, implementing mobile UI, reviewing interaction changes, writing acceptance criteria, or validating QA behavior for receipt capture, odometer capture, error states, loading feedback, and offline recovery.
---

# Driver Mobile UX

Apply this skill as the default UX standard for any driver-facing mobile workflow.
Optimize for sunlight, gloves, interruptions, one-hand use, and unstable connectivity.

## Core Principles

Enforce these interaction rules:
- Minimize typing whenever possible.
- Prefer buttons over text inputs.
- Use numeric keypad input for odometer and fuel amount fields.
- Keep tap targets at least `44px`.
- Use large, visually dominant primary buttons for critical actions.
- Keep important actions reachable with one hand.

## Receipt Capture Workflow

Implement receipt capture with a camera-first path:
- Open camera capture as the primary action.
- Offer a clear `Retake photo` action before final submit.
- Show immediate visual confirmation after capture so the driver knows the photo is attached.

## Odometer Workflow

Handle odometer capture as recommended but non-blocking:
- Request odometer capture when available.
- Provide explicit fallback when the driver cannot capture odometer now.
- Do not block submission only because odometer is temporarily unavailable.

## Error Handling

Design recoverable errors:
- Show clear, plain-language messages.
- Provide retry options at the point of failure.
- Avoid technical jargon and internal error terms.

## Loading and Submission Feedback

Make system state explicit:
- Always show visible feedback while processing.
- Never leave the driver unsure whether action succeeded, failed, or is still pending.
- Confirm success with immediate status on the same screen.

## Offline Awareness and Recovery

Support poor connectivity without data loss:
- Inform the driver clearly when connectivity fails.
- Allow retry from the failed state.
- Preserve entered data and captured artifacts during retry attempts.

## Safety and Speed Rules

Keep field operation interactions short and obvious:
- Avoid long interactions.
- Avoid complex forms and multi-step detours.
- Prioritize speed, clarity, and low cognitive load.

## Behavior Requirements

Apply these constraints to all proposals and implementations:
- Do not introduce UI complexity that slows drivers.
- Prefer fast, obvious workflows over feature-rich interfaces.
- Always evaluate UX decisions against real field conditions.

## Agent Usage Checklist

Use this checklist during design, build, and validation:
- `designer_uiux`: Verify one-hand reachability, clear state feedback, and camera-first receipt flow.
- `frontend_driver`: Implement keypad modes, large tap targets, clear retries, and data-preserving offline retries.
- `qa`: Test sunlight legibility assumptions, glove-friendly controls, interruption recovery, offline failures, retry behavior, and non-blocking odometer fallback.
