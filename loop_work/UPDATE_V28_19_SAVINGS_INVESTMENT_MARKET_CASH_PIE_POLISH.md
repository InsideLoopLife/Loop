# v28.19 - savings provider search + investment cash/market/pie polish

## Savings
- Expanded the UK provider catalogue: Revolut, app banks, mainstream banks, savings platforms and regional building societies.
- Reworked “Who do you already bank with?” to be search-first rather than a fixed row of visible bank tiles.
- Added admin savings job controls directly under Admin > Savings:
  - AI savings source check.
  - Run savings watch.
  - Expire stale savings rows.

## Investments
- Added investment account cash split fields:
  - total cash available
  - main/free cash
  - dividends waiting to reinvest
  - cash source
- SnapTrade sync now attempts to identify provider cash fields and dividend/reinvestment cash fields where exposed, falling back to balance-minus-positions only when needed.
- Trading 212/SnapTrade accounts can now show cash separately from holdings value.
- Added manual overrides in investment pot settings for cash and dividend cash.
- Improved market status mapping for MIC codes such as XNYS and XNAS so US holdings do not show as closed merely because the broker sent a MIC rather than NYSE/NASDAQ.
- The “no Trading 212 pie grouping from SnapTrade” warning is now a one-time dismissible message per account.
- Added a clearer edit-all-assets route via the pot header: select holdings, glow-highlight them, apply a pie/group label, then save.

## Mortgage/savings admin continuation
- Mortgage deal cards now have a client-side shortlist folder and shortlist-only switch as a step toward tiered multi-deal comparison.
- Savings jobs are now available from Admin > Savings instead of being hidden in the broader Wealth Watch area only.

## SQL
Run:

```sql
db/v28_19_savings_bank_search_investment_cash_market_pie_polish.sql
```


## v28.19.1 SQL hotfix

The v28.19 seed rows for `app_future_integration_tasks` now include the required `task_key` column and use `on conflict (product_key, task_key)` so the migration is idempotent. A standalone `db/v28_19_1_future_task_key_hotfix.sql` is included for environments where the previous v28.19 run failed at the task insert step.
