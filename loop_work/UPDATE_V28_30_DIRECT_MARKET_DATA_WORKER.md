# v28.30 — Direct Market Data Worker

## Purpose

The previous Render background worker woke every minute and called live Next API cron routes on `APP_BASE_URL`.
That worked only when a deployed web service was available.

This update adds a direct background worker that runs the market-data jobs inside the worker process itself.
It writes to Supabase directly and therefore does not need a live Next web service URL.

This lets localhost development continue while the Render worker keeps Supabase market/chart data fresh.

## Changed

- Added `scripts/market-data-direct-worker.ts`.
- Changed `npm run worker:market-data` to run the direct worker via `tsx`.
- Kept the old HTTP caller worker available as `npm run worker:market-data-http`.
- Added `tsx` so Render can execute the TypeScript worker without building the Next app.
- Worker now directly runs:
  - `runInvestmentPriceSnapshotJob`
  - `runSnapTradeProviderSnapshotJob`
- No `APP_BASE_URL` or `CRON_SECRET` is required for the direct worker.
- Tier-aware cadence remains inside the underlying investment snapshot runner.
- Overlap protection remains in the worker so a slow run does not stack another run on top.

## Render Background Worker settings

```txt
Language: Node
Root Directory: loop_work
Build Command: npm ci
Start Command: npm run worker:market-data
Instance Type: Starter initially
```

## Required worker env vars

```env
NODE_VERSION=22
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SECRET_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
APP_ENCRYPTION_KEY=...
SNAPTRADE_CLIENT_ID=...
SNAPTRADE_CONSUMER_KEY=...
SNAPTRADE_BASE_URL=https://api.snaptrade.com/api/v1
```

`NEXT_PUBLIC_SUPABASE_ANON_KEY` is still useful for shared app config, but the direct worker itself uses the server-side Supabase key.

## Optional worker env vars

```env
MARKET_DATA_WORKER_PRICE_INTERVAL_MINUTES=1
MARKET_DATA_WORKER_SNAPTRADE_INTERVAL_MINUTES=1
MARKET_DATA_WORKER_SNAPTRADE_REALTIME_ONLY=true
MARKET_DATA_WORKER_MAX_USERS=50
MARKET_DATA_WORKER_RUN_ON_START=true
MARKET_DATA_WORKER_FORCE_PRICE=false
MARKET_DATA_WORKER_DISABLED=false
MARKET_DATA_WORKER_PRICES_ENABLED=true
MARKET_DATA_WORKER_SNAPTRADE_ENABLED=true
```

## Localhost workflow

- Run localhost as normal with `npm run dev`.
- Render worker writes fresh market/portfolio snapshots to Supabase.
- Localhost reads those same Supabase rows for charts.
- No live web service is required for the worker to run.

## Fallback

If you need the old mode that calls cron endpoints on a deployed web service:

```bash
npm run worker:market-data-http
```

That old mode still requires `APP_BASE_URL` and `CRON_SECRET`.

## SQL

No SQL required.
