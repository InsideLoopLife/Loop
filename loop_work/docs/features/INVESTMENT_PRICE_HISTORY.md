# Investment 15-minute price history

## What runs every 15 minutes

The main job logic now lives in:

```txt
lib/investments/price-snapshot-runner.ts
```

It is used by:

```txt
app/api/cron/investment-price-snapshots/route.ts
scripts/investment-price-worker.mjs
```

The runner:

1. Uses the Supabase service/admin key server-side only.
2. Reads all polling-enabled investment holdings with a ticker/fund code.
3. Groups them by distinct `ticker + exchange`, so the same ticker is fetched once.
4. Skips holdings that already have a snapshot in the last 14 minutes.
5. Skips rough non-market hours unless `force=true` is passed.
6. Calls the existing market lookup function:

```txt
fetchInvestmentQuote(...)
```

7. Inserts rows into:

```txt
investment_price_snapshots
```

A database compatibility view called `stock_price_history` maps onto this same table for code/planning references that use that older wording.

## How to run it

### Option A: external cron / Render cron

Call:

```txt
GET /api/cron/investment-price-snapshots
Authorization: Bearer <CRON_SECRET>
```

Set either:

```txt
CRON_SECRET=...
# or
INVESTMENT_CRON_SECRET=...
```

### Option B: Node worker using node-cron

Run this as a separate Render background worker or local process:

```bash
npm run worker:investment-prices
```

Required env vars:

```txt
APP_BASE_URL=https://your-live-domain
CRON_SECRET=...
SUPABASE_SECRET_KEY=...
```

## Chart wiring

The frontend chart is:

```txt
components/investments/InvestmentHistoryChart.tsx
```

It uses Chart.js and AJAX-fetches:

```txt
/api/investments/history?holdingId=<id>&range=1w
/api/investments/history?accountId=<id>&range=1w
```

## UK mutual funds / Yahoo fund codes

Yahoo Finance fund codes like `0P0000QUJW.L` are now accepted. The code treats them as `asset_kind = fund`, `exchange = Yahoo Fund`, and keeps the quote in GBP rather than assuming LSE pence/GBX.
