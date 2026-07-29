# Sequential forms rollout — progress

Order confirmed: pensions/investments → income → savings → mortgage → rest.

## Done: pensions/investments (4/4)
- Add pension pot (`AddPensionAccountWizard.tsx`) — found and fixed a real
  step-loss bug along the way (see below).
- Add pension fund (`AddPensionFundWizard.tsx`)
- Add investment account (`AddInvestmentAccountWizard.tsx`) — Moneybox's
  extra allocation-model fields aren't folded in yet, flagged in the file.
- Add investment holding (`AddInvestmentHoldingWizard.tsx`) — kept the
  existing live typeahead search exactly as-is, only grouped the
  post-selection details into sequential steps.

## Done: income (1/1)
- `PayEventWizard.tsx` replacing `PayEventForm`, wired into both call sites.

## Done: savings (1/1, with a caveat)
- `SavingsAccountWizard.tsx` wired into `app/accounts/page.tsx`'s import —
  but the original form wasn't actually rendered anywhere in that file,
  looks like orphaned code from an earlier refactor. Worth confirming
  where savings account creation actually happens live.

## Done: mortgage (5/5, or 4/5 + 1 left as-is)
- Add/edit home (`HomeWizard.tsx`)
- Add/edit mortgage deal (`MortgageWizard.tsx`)
- Add/edit valuation (`ValuationWizard.tsx`)
- Add property move search (`MoveQueryWizard.tsx`) — kept the live
  Rightmove/Zoopla/OnTheMarket URL enrichment lookup exactly as-is, same
  approach as the investment holding search.
- **Left as-is by design:** `ScenarioForm` (5 fields, single-purpose
  mortgage calculator — already simple enough that steps would add
  friction, not remove it).

## Done: "the rest" — everything found so far
- **Account:** `AccountJobsPanel.tsx` — add-job form rebuilt in place as a
  5-step wizard (who/employer → employment type → leave & pattern →
  document → notes). The job list on the right is unchanged (it's a
  display, not a form).
- **Lifestyle:** `BillWizard.tsx` and `MealWizard.tsx` replacing the old
  `BillForm`/`MealForm`, wired into `LifestyleClient.tsx`. `SupermarketForm`
  (4 fields) left as-is — too simple to benefit.
- **Family planning:** `FamilyPlanningWizards.tsx` — five separate wizards
  (`CalendarPeriodWizard`, `LeaveAllowanceWizard`, `CoverAssignmentWizard`,
  `CalendarSourceWizard`, `ImportSchoolCalendarWizard`) replacing five
  inline forms in `FamilyPlanningClient.tsx`. Worth noting:
  `ImportSchoolCalendarWizard` is your existing term-dates-from-a-school
  import flow — relevant context for when the childcare term-dates work
  comes up again.
- **Affordability:** `AffordabilitySearchClient.tsx`'s save-scenario form
  left as-is — it's a single-purpose "review and confirm what the search
  already computed" screen, not a multi-step data-entry form.

## Newly found, not yet touched: Nutrition
`components/nutrition/NutritionClient.tsx` (1,937 lines) has several
substantial forms — `RecipeForm`, `LogFoodForm`, `EditLogForm`,
`MenuImportForm`, plus a settings form. This wasn't in the original
bucket list and is roughly as large as everything else combined. Flagging
rather than rushing it in.

## Consistent throughout
- Same server actions, same field names everywhere — zero logic changes,
  purely UI restructuring.
- Every wizard keeps all steps mounted (`display: none`, never unmounted)
  so nothing gets silently dropped from the submitted form.

## A real bug found and fixed along the way
The old "Add pension pot" form's two steps were a plain
`{step === 1 ? (...) : (...)}` — step 1's fields (provider, label, who
it's for, account type) were fully unmounted once you moved to step 2, with
no hidden inputs preserving them. Submitting from step 2 silently fell back
to the server action's defaults regardless of what was actually picked in
step 1. Fixed as a side effect of the rebuild.

## Housekeeping
Old form components/inline forms are now unused but left in place for
comparison/rollback where they were standalone functions
(`AddPensionAccountForm`, `AddPensionFundForm`, `AddInvestmentAccountForm`,
`AddInvestmentHoldingForm`, `PayEventForm`, `SavingsAccountForm`,
`HomeForm`, `MortgageForm`, `ValuationForm`, `MoveQueryForm`). Safe to
delete once you've verified the new ones.

## Verification
Every new/modified file passes an esbuild syntax check as it was built.
Not a full `tsc`/build — run your normal build before deploying.
