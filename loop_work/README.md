# Files to add to git — drop into `loop_work/` at these exact paths

**Update (after your first push):** your codebase already relocated
`app/investments/actions.ts` → `lib/investments/actions.ts` — confirmed
on GitHub, and your Moneybox fix survived that move intact. All six
files below that import from it have been corrected to
`@/lib/investments/actions`. The stray old-path file is removed from
this package; don't add it back.

Also added: `scripts/market-data-direct-worker.ts` — this still had the
old broken `@/lib/supabase/admin` import on GitHub after your last push
(your local `requireFromWorker` fix hadn't made it in yet).

Everything in this folder mirrors your repo's `loop_work/` structure.
Copy each file to the matching path, overwriting where one already
exists, then `git add`, commit, and push.

## Replace these existing files
```
app/accounts/page.tsx
app/api/investments/history/route.ts
components/account/AccountJobsPanel.tsx
components/household/PersonCalendarPlanner.tsx
components/income/IncomeTrackerClient.tsx
components/investments/AmplifiedInvestmentsDashboard.tsx
components/investments/PensionsInvestmentsClient.tsx
components/lifestyle/FamilyPlanningClient.tsx
components/lifestyle/LifestyleClient.tsx
components/mortgage/MortgagePlannerClient.tsx
lib/investments/market-data.ts
lib/investments/pension-contribution-runner.ts
scripts/market-data-direct-worker.ts
```

## Add these new files
```
components/household/PayEventWizard.tsx
components/investments/AddInvestmentAccountWizard.tsx
components/investments/AddInvestmentHoldingWizard.tsx
components/investments/AddPensionAccountWizard.tsx
components/investments/AddPensionFundWizard.tsx
components/lifestyle/BillWizard.tsx
components/lifestyle/FamilyPlanningWizards.tsx
components/lifestyle/MealWizard.tsx
components/mortgage/HomeWizard.tsx
components/mortgage/MortgageWizard.tsx
components/mortgage/MoveQueryWizard.tsx
components/mortgage/ValuationWizard.tsx
components/savings/SavingsAccountWizard.tsx
components/ui/CollapsibleSection.tsx
```

All 27 files pass an esbuild syntax check. Not a full `tsc`/build — run
that before deploying. Your editor was showing 3 problems across
`actions.ts`/`pension-contribution-runner.ts` before this fix — the
import-path issue accounts for at least part of that; if anything's
still flagged after this update, send over the exact Problems panel
text and I'll chase it down precisely rather than guess.

## Deliberately NOT included, and why

**Childcare overhaul files** (`ChildCostWizard.tsx`, `childcareRegistry.ts`,
etc.) — checked, and your codebase already has these, byte-for-byte.
Nothing to do there.

**`app/investments/page.tsx`** — the version I'd patched earlier (for a
pension chart data-fetch) is now well out of sync with your current
file. Rather than overwrite your newer work with my stale copy, I dropped
it. Nothing currently reads the prop it used to feed, so nothing is lost
by skipping it.

**`components/investments/PensionPerformanceOverview.tsx`** — the pension
overview redesign I built earlier assumed a simpler page structure. Your
codebase has since grown a proper "Pension live view" (`pension-command`
experience) that looks like it already covers similar ground — including
my old version risked conflicting with or regressing that. Worth a quick
look together before deciding if anything from the old component is still
worth pulling in.
