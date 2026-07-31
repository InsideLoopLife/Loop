# Complete TypeScript fix pass — 53 errors → 0, fully verified

This is the result of a full `tsc --noEmit` pass across the entire live
codebase (dead reference files in `db/`, `patches/`, and `.example.`
files excluded — they were never part of the deployed app). Started at
53 errors, ended at **0**, confirmed with a clean, stable rerun.

## The genuinely important findings, not just type-annotation noise

- **`components/nutrition/NutritionClient.tsx`** — found and removed a
  block of code in `RecipeForm` that was copy-pasted from a different
  component (`LogFoodForm`) and referenced state that was never declared
  in `RecipeForm` at all. This wasn't just a type error — it would have
  thrown a real `ReferenceError` the moment a user clicked it. It had
  **never once worked**, at any point.
- **`components/investments/AmplifiedInvestmentsDashboard.tsx`** — found
  an incomplete "expand to full drawer" feature: the click handlers and
  state all exist, but the actual `CostBasisDrawer`/`OtherHoldingsDrawer`
  components were never built. Removed the broken references so the
  build succeeds; clicking "expand" is now a no-op instead of a build
  failure. Building the real drawer components is separate, future work
  if you want that feature.
- **`domains/wealth/financial-flow/FinancialFlowPage.tsx`** — found a
  genuinely missing column in a Supabase query: `category_id` exists on
  the real `child_costs` table but was never included in the `.select()`
  string, so child-cost category grouping was silently broken. Added it
  to both the query and the type.
- **Several files** (`childcareRegistry.ts`, `SpendingPlannerClient.tsx`,
  `NurseryCostForm.tsx`, `month-plan.ts`) had the same recurring gap: a
  `CareType`/`cost_kind` union type that was missing `"activity"` and/or
  `"nanny"` as valid values, even though other parts of the codebase
  already treated them as real, valid categories. Fixed consistently
  everywhere it appeared.

## Everything else — genuine but more mechanical fixes
- Two `Map` constructor calls (`mortgage-catalogue.ts`,
  `mortgage-renewal-watch.ts`) hit a TypeScript inference quirk that
  collapsed the value type to `{}`; fixed with explicit generics.
- `tsconfig.json` target bumped from ES2017 → ES2018 — required by a
  regex flag (`/s`) already deliberately used in
  `school-calendar-parser.ts` for correct multi-line date parsing; this
  wasn't a workaround, the code already needed this.
- A few missing/loose prop types, a `PromiseLike` vs `Promise` mismatch,
  and one `Map`-generic-inference issue in the financial briefing file.

## Files changed (18 total)
```
tsconfig.json
lib/calculations/childcareRegistry.ts
app/household/actions.ts
components/investments/PensionsInvestmentsClient.tsx
components/nutrition/NutritionClient.tsx
app/onboarding/page.tsx
components/nutrition/ProductLabelScanner.tsx
components/spending/SpendingPlannerClient.tsx
components/household/NurseryCostForm.tsx
components/investments/AmplifiedInvestmentsDashboard.tsx
app/api/shopping/plan/route.ts
app/admin/investment-storage/page.tsx
app/accounts/page.tsx
domains/wealth/financial-flow/FinancialFlowPage.tsx
lib/planning/month-plan.ts
lib/wealth/mortgage-catalogue.ts
lib/wealth/mortgage-renewal-watch.ts
lib/briefing/build-financial-briefing.ts
```

## Verification
`npx tsc --noEmit` run twice in a row against the complete codebase
(minus the dead-file exclusions), both times with zero errors and a
clean exit. This should mean the next Render build gets past the
TypeScript checking step entirely — assuming no further, currently
undiscovered issues surface at the actual `next build` bundling stage
(which does some checks slightly differently from bare `tsc`), but this
is as thorough a check as can be done without actually running the
Render build itself.
