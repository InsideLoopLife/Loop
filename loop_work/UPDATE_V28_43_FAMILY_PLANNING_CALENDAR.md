# v28.43 — Lifestyle Family Planning Calendar

Adds a cost-safe family planning calendar under Lifestyle. The feature only appears when the household has active child profiles.

## Included

- New route: `/lifestyle/family-planning`
- Conditional Lifestyle card shown only when children exist
- School/nursery source library
- Manual school holiday / nursery closure / inset date entry
- Annual leave allowance by adult/person
- Cover assignment planner
- Gap detection for weekday child-cover requirements
- Leave remaining estimates
- No AI, no web-search, no background worker required by default

## SQL

Run:

```txt
db/v28_43_family_planning_calendar.sql
```

## Tables

- `family_calendar_sources`
- `family_calendar_periods`
- `family_leave_allowances`
- `family_cover_policies`
- `family_cover_assignments`

## Cost design

Automatic school data is intentionally not implemented as a background AI/web-search workflow. The safe path is:

1. Manual dates
2. CSV/ICS import later
3. Cached local-authority/school source links
4. Optional admin-only extractor later, with explicit usage caps

