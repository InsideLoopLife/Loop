# LOOP savings / Cash ISA / fixed-term daily rate watch on Render

## What runs

The Render cron calls:

`GET /api/cron/savings-rate-watch?mode=full&enforce_local_hour=1`

The endpoint:

1. Seeds the configured source catalogue.
2. Fetches/refreshes savings, Cash ISA and fixed-term product sources.
3. Normalises products into the shared `savings_rate_deals` catalogue.
4. Stores product history and source provenance.
5. Uses pending-withdrawal lifecycle handling rather than deleting a product after one missing observation.
6. Recalculates user opportunities from the one shared catalogue.
7. Respects paid-tier entitlements when creating user-facing rate-watch results.
8. Returns a structured run report.

The source and product design follows `LOOP_Daily_Rates_Research_and_Implementation_Brief(1).md`: refresh globally once, preserve history, then filter and personalise for each user.

## Files

- `app/api/cron/savings-rate-watch/route.ts` — guarded API endpoint and orchestration.
- `lib/wealth/savings-catalogue.ts` — source refresh and catalogue normalisation.
- `lib/wealth/savings-rate-watch.ts` — product matching, user opportunities and stale-product handling.
- `scripts/run-savings-rate-watch.mjs` — one execution, used by Render.
- `scripts/savings-rate-watch-worker.mjs` — local 08:00 Europe/London worker.
- `render.yaml` — deployable Render cron definition.

## Environment variables

Set the same `CRON_SECRET` on the web service and cron job.

- `APP_BASE_URL=https://your-loop-web-service.onrender.com`
- `CRON_SECRET=<long random secret>`
- `SAVINGS_WATCH_MODE=full`
- `SAVINGS_WATCH_RUN_KIND=daily_8am_europe_london`
- `SAVINGS_WATCH_TIMEZONE=Europe/London`
- `SAVINGS_WATCH_ENFORCE_LOCAL_HOUR=true`

## Why the Render schedule contains 07:00 and 08:00 UTC

Render cron expressions are UTC. The UK changes between GMT and BST. The blueprint invokes at both UTC hours, while the API checks `Europe/London` and only proceeds when the local hour is 08:00. The daily run key makes the user opportunity run idempotent.

## Manual test

```bash
APP_BASE_URL=https://your-loop-web-service.onrender.com \
CRON_SECRET=your-secret \
SAVINGS_WATCH_MODE=full \
node scripts/run-savings-rate-watch.mjs
```

## Local worker

```bash
npm run worker:savings-rates
```

The local process must remain running. For deployed LOOP, use the Render cron instead.
