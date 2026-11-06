# Scheduled jobs (what actually runs)

Checked against Render on 6 Nov 2026. Render schedules are UTC.

| Render service | Type | When | What it does |
|---|---|---|---|
| `loop-rates-database-worker` (repo `loop-rates-cron-worker`) | Cron | 07:00 and 08:00 | Savings and mortgage product catalogue, Bank Rate, then calls the app's maintenance routes in order (list below). |
| `Loop` market-data worker (`npm run worker:market-data`) | Background worker | Every minute | Investment prices, SnapTrade positions. |
| `loop-pensions-daily` | Cron | 20:30 | `/api/cron/pensions-daily` (pension fund prices). |
| `loop-pension-fee-and-isin-refresh` | Cron | — | Pension fund fees and ISINs. |

App routes called by the rates worker, in order: savings-rate-watch (watch only), mortgage-renewal-watch,
loopwatch-daily, deal-news-review, daily-financial-briefing, daily-snapshot, investment-pension-snapshot,
pension-performance-refresh, pensions-daily, product-price-refresh, property-archive-cleanup,
provider-glossary-daily-check, notification-insights, calendar-sync, uptime-checks, council-tax-refresh,
weekly-digest (Mondays), then admin-alerts-refresh last.

## Routes that exist but are not scheduled
- `mortgage-catalogue-refresh` — superseded: the rates worker maintains `mortgage_rate_deals` directly.
- `money-deals-daily`, `money-deal-refresh` — old money-deals watch; never run in production.
- `investment-price-snapshots`, `investment-coverage-requests` — run by the market-data worker / admin page, not cron.
- `provider-glossary-check` — superseded by `provider-glossary-daily-check`.

## Manual monthly task
- Bank of England mortgage averages: upload the CSV at `/admin/boe-benchmarks` after the 5th working day
  (the Bank disallows automated downloads). An admin alert appears when it's due.

`vercel.json` and `render.cron-only.yaml` were removed: they described jobs that were never set up on Render.
