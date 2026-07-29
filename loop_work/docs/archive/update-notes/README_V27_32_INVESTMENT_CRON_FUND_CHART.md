# V27.32 - Investment cron, Yahoo fund codes and Chart.js history

## Added

- Shared 15-minute investment price job runner.
- Node-cron worker script.
- Robust API cron endpoint using the shared runner.
- Distinct ticker/exchange batching.
- Console logs for each stage/failure.
- Yahoo Finance fund-code support such as `0P0000QUJW.L`.
- Chart.js history component.
- `/api/investments/history` AJAX endpoint.
- `stock_price_history` compatibility view over `investment_price_snapshots`.

## Migration

Run:

```txt
db/v27_32_investment_cron_fund_chart.sql
```

## Production notes

Use a Render Cron Job or separate background worker. The Node worker command is:

```bash
npm run worker:investment-prices
```
