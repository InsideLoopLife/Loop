# v28.31 - Direct Worker Manual Holdings, Purge Cadence and Git/Render Notes

## Why
v28.30 moved the market-data worker into direct Supabase mode so it can update data while the main app is still being developed locally. This update hardens that setup:

- manually-entered holdings with a ticker are explicitly included in market refreshes;
- SnapTrade/provider-imported holdings remain provider-led unless deliberately enabled;
- retention/purge/compaction now runs on a slower maintenance interval instead of every 1-minute price loop;
- worker scripts load `tsconfig-paths/register` so `@/` imports resolve reliably on Render;
- added a safe SQL backfill/index for old manual holdings.

## Render worker
Use a Background Worker:

```txt
Language: Node
Root Directory: loop_work
Build Command: npm ci
Start Command: npm run worker:market-data
Instance: Starter is enough for early usage
```

Important env vars:

```env
NODE_VERSION=22
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SECRET_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
APP_ENCRYPTION_KEY=...
SNAPTRADE_CLIENT_ID=...
SNAPTRADE_CONSUMER_KEY=...
SNAPTRADE_BASE_URL=https://api.snaptrade.com/api/v1
MARKET_DATA_WORKER_PRICE_INTERVAL_MINUTES=1
MARKET_DATA_WORKER_SNAPTRADE_INTERVAL_MINUTES=1
MARKET_DATA_WORKER_MAINTENANCE_INTERVAL_MINUTES=60
MARKET_DATA_WORKER_SNAPTRADE_REALTIME_ONLY=true
MARKET_DATA_WORKER_MAX_USERS=50
MARKET_DATA_WORKER_FORCE_PRICE=false
MARKET_DATA_WORKER_PRICES_ENABLED=true
MARKET_DATA_WORKER_SNAPTRADE_ENABLED=true
MARKET_DATA_WORKER_MAINTENANCE_ENABLED=true
```

## Manual holdings behaviour
A manually-added holding will refresh automatically when:

- `investment_holdings.ticker` is present, e.g. `AAPL`, `VOD.L`, `GFRD.L`;
- `price_polling_enabled` is not false;
- the user/tier is due according to Admin > Investment Storage cadence;
- the market-hours rule allows it, unless force/manual run is used.

If a user adds a fund/share with only a display name and no ticker/fund code, the worker cannot reliably fetch a quote. That should go through the coverage request / instrument mapping flow.

## Purging / retention
The 1-minute price loop no longer runs heavy retention SQL every minute. It only writes due snapshots. The same worker now runs investment retention maintenance separately, default every 60 minutes.

Retention still uses:

- `loop_admin_prune_investment_price_snapshots()` for holding-level points;
- `loop_admin_compact_investment_instrument_price_points()` for global ticker/exchange raw points.

Run:

```sql
db/v28_31_direct_worker_manual_purge.sql
```

## Git/Render requirement
Render runs the code that exists in the Git repository connected to the service. The zip/chat file does not run on Render by itself. The repository must contain:

- `package.json`
- `scripts/market-data-direct-worker.ts`
- `lib/investments/price-snapshot-runner.ts`
- `lib/investments/market-data.ts`
- `lib/investments/fx.ts`
- `lib/investments/snapshot-settings.ts`
- `lib/snaptrade/*`
- `lib/supabase/admin.ts`
- supporting `lib/wealth/user-tiers.ts`

If the connected Git repo is empty or not updated with these files, the worker will fail even if the environment variables are correct.
