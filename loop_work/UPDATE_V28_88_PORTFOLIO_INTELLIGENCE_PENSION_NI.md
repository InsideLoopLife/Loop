# LOOP v28.88 — Portfolio intelligence and pension NI reinvestment

## Investment portfolio

- Rebuilt the diversification display as **weight × movement bars**:
  - Width represents the holding's share of the represented portfolio.
  - Height represents the selected-period percentage move.
  - Positive moves rise in green; negative moves fall in red.
- The displayed allocation is normalised to 100% and the grouped **Other** section opens a paginated holding inspector.
- Added a bulk **Missing cost basis** drawer showing ticker, units, latest price and an editable average purchase price.
- Saving a manual purchase price writes both the holding cost basis and an auditable manual purchase lot.
- Expanded provider/asset logo matching with initials fallback, including broad provider branding for funds and ETFs.
- Empty pot/pie groups are excluded from the live allocation view.
- Added holding/account reconciliation messaging when row values differ materially from the portfolio total.

## Portfolio charts

- The primary chart now requests portfolio-level history for the selected account IDs.
- Saved complete portfolio batches remain the preferred, cash-flow-aware history.
- Where insufficient complete portfolio snapshots exist, LOOP can show a clearly labelled **market-performance estimate** built from stored/direct instrument price histories and current weights.
- The estimate is explicitly separated from account-value history because it excludes purchases, sales, dividend reinvestments and cash movements.
- LOOP does not use AI to invent or interpolate raw market prices.

## Pension salary sacrifice

- Added `employer_ni_passback_percent` and `employer_base_salary_basis` to pension accounts.
- Salary-sacrifice pension input now separates:
  - employee sacrifice;
  - employer base contribution;
  - employer NI saved;
  - the percentage of that saving passed back into the pension;
  - fixed additional employer contributions.
- The same deterministic calculation is used by the UI and the daily pension contribution runner.
- Existing salary-sacrifice accounts with NI top-up enabled but no configured fixed top-up are migrated to the saved-NI model with a 100% pass-back default.
- Employer NI defaults to 15% for the 2026/27 configuration, while remaining editable by tax year/scheme.
- The interface warns that National Minimum Wage compliance cannot be confirmed without contracted-hours data.

## Required migration

Run:

```text
supabase/migrations/202607141330_v28_88_portfolio_intelligence_pension_ni.sql
```

Then restart LOOP and refresh connected investment accounts so activity, cost-basis and updated market-history coverage can populate.
