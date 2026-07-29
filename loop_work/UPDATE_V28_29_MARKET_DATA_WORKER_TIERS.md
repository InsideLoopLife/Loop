# UPDATE V28.29 — Market data background worker + tier cadence

## What changed

- Converted the existing investment price worker from a 15-minute price-only loop to a continuous market-data worker.
- The worker now runs investment price snapshots and SnapTrade position snapshots.
- Default cadence is every 1 minute for both jobs.
- The price snapshot endpoint still respects tier cadence and admin settings; do not use force mode unless deliberately testing.
- Added overlap protection so a slow run does not start a second copy of the same job.
- Added `LOOP_CRON_SECRET` support to the investment price endpoint, matching the other cron routes.
- Added `npm run worker:market-data` while keeping `npm run worker:investment-prices` as a compatible alias.

## Render Background Worker

Create a Render Background Worker with:

```txt
Language: Node
Root Directory: loop_work
Build Command: npm ci
Start Command: npm run worker:market-data
```

Required environment variables on both the web service and worker:

```env
APP_BASE_URL=https://YOUR-WEB-SERVICE-DOMAIN
CRON_SECRET=long-random-shared-secret
LOOP_CRON_SECRET=long-random-shared-secret # optional, can match CRON_SECRET
SUPABASE_SECRET_KEY=server-only-supabase-key
SUPABASE_SERVICE_ROLE_KEY=server-only-supabase-key
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-public-anon-or-publishable-key
```

Optional worker controls:

```env
MARKET_DATA_WORKER_PRICE_INTERVAL_MINUTES=1
MARKET_DATA_WORKER_SNAPTRADE_INTERVAL_MINUTES=1
MARKET_DATA_WORKER_SNAPTRADE_REALTIME_ONLY=true
MARKET_DATA_WORKER_MAX_USERS=50
MARKET_DATA_WORKER_RUN_ON_START=true
MARKET_DATA_WORKER_FORCE_PRICE=false
MARKET_DATA_WORKER_DISABLED=false
```

## Tier behaviour

The worker wakes every minute. The snapshot runner decides which holdings are due:

- realtime / enterprise with connected provider: `investment_realtime_minutes_between_points`, default 1 minute
- plus / pro / premium style tiers: `investment_plus_pro_minutes_between_points`, default 15 minutes
- free / starter / delayed users: `investment_free_minutes_between_points`, default 30 minutes

The SnapTrade position job defaults to realtime users only.

## Important

This is near-realtime polling, not tick-by-tick exchange streaming. The UI will show the latest saved points when the investment pages query or refresh.
