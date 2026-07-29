# V27.33 – Investment chart compatibility fix

This patch fixes the two issues seen after v27.32:

## 1. `chart.js` module not found
The investment history chart no longer imports `chart.js`. It now renders a small responsive SVG line chart directly inside `components/investments/InvestmentHistoryChart.tsx`, so the app does not need an extra chart dependency just to build.

## 2. `snapshot_at` missing from `investment_price_snapshots`
Some existing databases already had `investment_price_snapshots`, but without the newer `snapshot_at` column. `CREATE TABLE IF NOT EXISTS` does not add missing columns, so the index/view creation could fail.

Run:

```sql
-- db/v27_33_investment_chart_snapshot_compat.sql
```

The migration explicitly adds `snapshot_at`, backfills it from `created_at` or `snapshot_date`, then recreates the `stock_price_history` compatibility view.

## Files changed
- `components/investments/InvestmentHistoryChart.tsx`
- `package.json`
- `package-lock.json`
- `db/v27_32_investment_cron_fund_chart.sql`
- `db/v27_33_investment_chart_snapshot_compat.sql`
