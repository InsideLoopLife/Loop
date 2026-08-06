# Investment market worker and pension cron

## Continuous market worker

Render service type: Background Worker

Build command:

```bash
npm ci
```

Start command:

```bash
npm run worker:market-data
```

Recommended environment:

```text
MARKET_DATA_WORKER_PRICE_INTERVAL_MINUTES=1
MARKET_DATA_WORKER_SNAPTRADE_INTERVAL_MINUTES=30
MARKET_DATA_WORKER_MAINTENANCE_ENABLED=false
MARKET_DATA_WORKER_RUN_ON_START=true
```

The worker also requires the existing server-side Supabase URL/key and any
configured shared market-provider credentials. Never expose a service-role or
secret key through a `NEXT_PUBLIC_` variable.

Stock/ETF quotes run in aligned one-minute buckets. SnapTrade position and cash
reconciliation is intentionally separate and runs every 30 minutes; it is not
the source of intraday ticker prices.

## Daily pension cron

Render service type: Cron Job

Schedule:

```text
15 5 * * *
```

Command:

```bash
npm run cron:pensions-daily
```

Required environment:

```text
APP_BASE_URL=https://loop-web-jf7p.onrender.com
CRON_SECRET=<the same value configured by the web service>
```

This refreshes provider/fund values and materialises editable dated pension
contribution threads. It does not run inside the one-minute stock loop.

## Retention

The live database job at 02:15 UTC owns market-history downsampling. Leave
`MARKET_DATA_WORKER_MAINTENANCE_ENABLED=false` to avoid a second scheduler
compacting the same tables.
