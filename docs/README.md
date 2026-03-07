# Documentation Index

This directory holds the canonical decision records, UX specifications, and supporting references for Fleet Fuel Monitoring.

## Structure

- `adr/`: architecture decision records
- `specs/pages/`: page-level UX and behavior specs
- `specs/components/`: reusable component specs
- `ui/reference/`: reference images and annotated screenshots used by specs

## Create A New ADR

1. Copy `docs/adr/ADR_TEMPLATE.md`
2. Name the file `ADR-XXXX-short-kebab-title.md`
3. Start with `Status: Proposed`
4. Link related specs, migrations, and security implications
5. Move to `Accepted`, `Deprecated`, or `Superseded` as the decision evolves

## Create A New Page Spec

1. Copy `docs/specs/pages/PAGE_SPEC_TEMPLATE.md`
2. Name the file in uppercase snake case for canonical pages, for example `ADMIN_DASHBOARD.md`
3. Set the current status at the top
4. Fill interaction states, tenant considerations, security considerations, and clickable navigation outcomes
5. Link any related component specs and ADRs

## Naming Conventions

- ADRs: `ADR-0001-short-kebab-title.md`
- Page specs: `UPPER_SNAKE_CASE.md`
- Component specs: `Component-Name.md` or `component-name.md`, but keep the convention consistent within the folder
- Reference images: descriptive kebab case, for example `dashboard-reference.png`

## Linking Images

Store reference images under `docs/ui/reference/`.

Use relative Markdown links from specs:

```md
![Annotated dashboard reference](../../ui/reference/dashboard-reference.png)
```

Do not commit generated mockups without a matching spec that explains how the image should be interpreted.
