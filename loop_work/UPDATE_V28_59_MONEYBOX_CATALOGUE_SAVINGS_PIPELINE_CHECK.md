# LOOP v28.59 - Moneybox catalogue + savings optimiser verification

## Why this build exists
The v28.58 Moneybox allocation modal only exposed a partial Moneybox asset set in the picker. This made the flow look like it only had a handful of funds/stocks, which is not good enough for a user-facing wealth platform.

## Moneybox changes
- Rebuilt `lib/investments/moneybox-funds.ts` as a reviewed catalogue:
  - 35 Moneybox fund/ETF/cash-trust options from the Moneybox fund range.
  - 20 Moneybox US stocks from the Moneybox support list.
  - 1 explicit Available Cash / unknown allocation option.
  - 1 Cash Trust fund option.
- Added aliases for common searches such as `S&P500`, `sp500`, `Google`, `NVIDIA`, `cash`, `AI`, `gilts`, `gold`, `tech`, and old v28.56 keys.
- Updated the Moneybox modal so an empty search shows every available asset instead of a small slice.
- Added a visible catalogue count and reviewed date in the modal.
- Kept the allocation validation at 100% so the model cannot save incomplete or over-allocated setups.

## Savings optimiser changes
- The admin one-click savings optimiser now seeds the default source universe first, then refreshes due source pages, then runs user recommendations, then expires stale rows.
- The cron route now calls the same seed + refresh + watch + expire pipeline unless `mode=watch_only` is passed.
- Savings source parsing can now extract multiple rate rows from table/best-buy pages instead of only one deal per source page.
- Expanded default UK savings source coverage with more banks, building societies, fixed-rate providers and marketplace sources.
- Added `last_result_payload` to `savings_rate_sources` so admin can see how many rows a source produced.

## SQL
Run:

```sql
-- db/v28_59_moneybox_catalogue_savings_pipeline_check.sql
```

This adds `savings_rate_sources.last_result_payload` and records the build note.

## Verification performed
- Parsed the full repository with TypeScript's compiler until dependency-resolution errors; no JSX/syntax errors remained after fixing an accidental global class replacement.
- Added a local check script for the Moneybox catalogue and savings parser behaviour.
- Confirmed Moneybox catalogue count is 56 assets and search returns the complete set when empty.
