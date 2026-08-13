# LOOP retirement UI integration fix

This fixes the specific issue found on 13 Aug 2026: the retirement components were present in the repo but never mounted into the live `/investments` page.

## Run from the repository root

```bash
node apply-retirement-ui.mjs
cd loop_work
npm run build
```

If the build passes:

```bash
git add loop_work/app/investments/page.tsx loop_work/components/investments/PensionsInvestmentsClient.tsx
git commit -m "Wire retirement planning into pensions investments overview"
git push
```

## What the patch does

- Loads `birth_date` for people.
- Loads saved `retirement_plans`.
- Passes plans into `PensionsInvestmentsClient`.
- Replaces the old Total Wealth / Performance / snapshots landing with the three intended cards:
  - Pension
  - Investments
  - Retirement Planning
- Pension and Investment cards open the existing rich live views.
- Retirement Planning opens the existing `RetirementPlannerPanel`.
- Saved retirement assumptions persist to Supabase and update the card immediately.
- The retirement projection recalculates from current pension/investment balances, not a stale saved projected value.

The script aborts rather than changing files if its expected anchors are not found, so it should fail safely if the repository has moved materially since this patch was produced.
