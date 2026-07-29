# v28.25 - Async coverage placeholders, admin grouping and savings-flow sync

## What changed

### Investment add-to-database flow
- No-confident-match ticker/ETF searches now queue an AI/admin coverage request and create a visible placeholder inside the selected investment pot.
- Placeholder shows ETA and progress steps:
  - ticker/instrument search
  - profile/logo lookup
  - document/fee information
  - starter history, minimum one month target
- The user is told the request usually takes 2-10 minutes during beta.
- Added `/api/cron/investment-coverage-requests` for background processing.
- Added `/api/admin/run-investment-coverage-queue` so admins can process the queue manually in development.

### Investment price updates
- The price snapshot runner now treats `price_polling_enabled = null` as enabled, instead of skipping those holdings.
- Added scheduled route entry for `/api/cron/investment-price-snapshots` every minute.
- The route decides which ticker/exchange groups are due based on tier cadence and shared raw price-point settings.
- Added `/api/admin/run-investment-price-snapshot` for manual force-run in development.

### Admin structure
- Admin nav is grouped by product area:
  - Users
  - Investments
  - House
  - Financial Flow
  - Savings
  - Health
  - Lifestyle
  - Tiers
  - Ops
- Added product landing pages for Financial Flow, Health and Lifestyle.
- Account dropdown for admins now includes quick links for Admin, Security, Runtime and Alerts.

### Savings in Financial Flow
- Savings top-ups now have a database trigger that creates/refreshes a linked planned item.
- These planned items use `item_type = saving_investment`, so they can appear as blue transfer-style flow items.
- Existing savings accounts with monthly top-ups are backfilled.

## SQL
Run after v28.24:

```sql
 db/v28_25_async_instrument_coverage_admin_reorg_savings_sync.sql
```

## Production scheduler note
The code now includes Vercel cron entries. If the deployment platform does not call authenticated cron routes with `CRON_SECRET`, use the existing external scheduler pattern and call:

- `/api/cron/investment-price-snapshots` every minute
- `/api/cron/investment-coverage-requests` every 15 minutes

The admin buttons can be used manually during development.
