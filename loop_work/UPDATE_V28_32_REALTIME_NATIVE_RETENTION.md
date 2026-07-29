# UPDATE v28.32 — Realtime Native Market Snapshots + Retention Policy

## What changed

- Market-data worker remains direct/Supabase mode and does not need a live web service.
- Manually-entered holdings and SnapTrade-imported holdings with a ticker are now eligible for one-minute market polling.
- Snapshot rows now keep native quote fields:
  - `native_price`
  - `native_value`
  - `native_currency`
  - `fx_rate_to_gbp`
  - `fx_source`
  - `bucket_interval`
- Existing `price` and `value` fields remain GBP-compatible so existing charts/totals do not break.
- The investment history API now prefers native snapshot values and converts to GBP for chart display.
- SnapTrade provider snapshots now store native provider/account currency as well as GBP-compatible values.
- SnapTrade holdings with tickers now set `price_polling_enabled=true`; provider sync still updates positions/units.
- Retention/purge now compacts rather than deleting old history:
  - 0–1 day: keep raw minute points.
  - Older than 1 day to 7 days: keep one 15-minute point, anchored to market open.
  - Older than 7 days to 30 days: keep one hourly point, anchored to market open.
  - Older than 30 days to 5 years: keep one daily point.
  - Older than 5 years: keep one weekly point.

## SQL to run

Run:

```sql
\i db/v28_32_realtime_native_retention_policy.sql
```

Or paste the file into Supabase SQL editor.

## Worker env

Recommended worker settings:

```env
MARKET_DATA_WORKER_PRICE_INTERVAL_MINUTES=1
MARKET_DATA_WORKER_SNAPTRADE_INTERVAL_MINUTES=1
MARKET_DATA_WORKER_MAINTENANCE_INTERVAL_MINUTES=60
MARKET_DATA_WORKER_PRICES_ENABLED=true
MARKET_DATA_WORKER_SNAPTRADE_ENABLED=true
MARKET_DATA_WORKER_MAINTENANCE_ENABLED=true
MARKET_DATA_WORKER_FORCE_PRICE=false
MARKET_DATA_WORKER_DISABLED=false
```

Required server keys remain:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SECRET_KEY=
SUPABASE_SERVICE_ROLE_KEY=
APP_ENCRYPTION_KEY=
SNAPTRADE_CLIENT_ID=
SNAPTRADE_CONSUMER_KEY=
SNAPTRADE_BASE_URL=https://api.snaptrade.com/api/v1
```

## Notes

The worker wakes every minute. The SQL/admin settings now set Free, Plus/Pro and Realtime cadence to one minute, so every refresh-enabled holding with a ticker is due every minute while market-hours rules allow it. Later, Admin > Investment Storage can move Free/Plus/Pro back to slower cadences if needed.
