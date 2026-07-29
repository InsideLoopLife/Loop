# Childcare module overhaul — v29.01

## What this does

Replaces the nursery-only add flow with a registry-driven system covering
nursery, childminder, breakfast club, after-school club, holiday camp, and
nanny — each with its own sequential question flow instead of one dense form.

## 1. Run this in Supabase first

`db/v29_01_childcare_care_types.sql`

- Additive only: adds `care_type` and `care_details jsonb` to `child_costs`.
- Backfills `care_type` from existing `cost_kind` for every current row.
- Widens the `cost_kind` check constraint to add a `nanny` bucket.
- Nothing existing is dropped, renamed, or made stricter in a breaking way.

## 2. New files

- `lib/calculations/childcareCalendar.ts` — placeholder England term/holiday
  calendar (same pattern as the existing bank-holiday list). Two academic
  years of typical dates are seeded; swap for real per-school dates once
  the term-dates PDF import lands.
- `lib/calculations/childcareRegistry.ts` — the registry: cost-type
  definitions + their wizard steps, plus per-month calculators for
  childminder, breakfast club, after-school club, holiday camp, and nanny.
  Adding a new cost type later means adding an entry here, not new UI code.
- `components/household/ChildCostWizard.tsx` — the new sequential
  typeahead + step-by-step add flow, styled to match `NurseryCostForm`'s
  existing conventions.

## 3. Modified files

- `app/household/actions.ts` — `buildChildCostPayload` branches on
  `care_type`. New types compute their monthly estimate via the registry
  and store `care_type`/`care_details`. Existing fixed/nursery/activity
  submissions are untouched, just now also backfill `care_type` for
  consistency with the new column.
- `app/spending/page.tsx`, `app/dashboard/page.tsx` — added `care_type,
  care_details` to the existing `child_costs` SELECT column lists.
- `components/spending/SpendingPlannerClient.tsx`:
  - `ChildCost` type gains `care_type`/`care_details`.
  - `getChildCostMonthlyAmount` dispatches new care types to the registry
    calculator (still recomputed per-month for the 12-month forecast, same
    as nursery/activity already do) — holiday camps and wraparound clubs
    correctly show £0 outside their active weeks rather than an even
    monthly smear.
  - `categoryLabel` gives each new care type its own label (Childminder,
    Breakfast club, After-school club, Holiday camp, Nanny) instead of
    falling through to a generic bucket label.
  - The "Add child cost" modal now opens `ChildCostWizard` instead of
    `NurseryCostForm`.

## 4. Deliberately scoped out — follow-ups

- **Editing existing new-type costs.** The edit modal still uses
  `NurseryCostForm`, which doesn't understand `care_details`. I added a
  guard so opening "Edit" on a childminder/breakfast-club/after-school-
  club/holiday-camp/nanny row shows a "not editable yet, delete and
  re-add" notice rather than silently rendering the wrong fields. An
  edit-mode version of `ChildCostWizard` (prefilled from `initialValues`)
  is the natural next step.
- **Child ages aren't passed to the wizard.** Your `Person` type has no
  `birth_date`, so the funded-hours suggestion (15/30 hrs from age 3)
  degrades gracefully to "no default" rather than a smart prefill. Wiring
  `birth_date` through the people query would unlock this.
- **Term dates are still a placeholder calendar**, not real per-school
  dates — this was already flagged as outstanding before this overhaul and
  is unchanged by it.
- **Eligibility engine** (Ofsted-registration gating, Tax-Free Childcare/
  UC interaction) is not built here — this overhaul is the data model +
  UI for entering costs, not the benefits-calculation layer.

## 5. Quick sanity check

All seven new/modified TypeScript/TSX files pass an `esbuild` syntax pass
clean. This is NOT a full `tsc` type-check (the project's node_modules
weren't available in this environment) — worth running your normal
`npm run build` / `tsc --noEmit` before deploying.
