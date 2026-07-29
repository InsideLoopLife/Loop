# Render daily savings and ISA rates job

The market catalogue is refreshed once, centrally, and user opportunities are calculated from that shared snapshot. It does not fetch a product feed separately for each user.

## Deploy

1. Apply `supabase/migrations/202607101430_savings_intelligence_interest_pots_flow.sql`.
2. Deploy the web service and set `CRON_SECRET` on it.
3. Create the Render cron service from `render.yaml`.
4. Set `APP_BASE_URL` to the public LOOP web-service URL.
5. Set the cron service `CRON_SECRET` to the same value as the web service.

Render cron schedules use UTC. The blueprint invokes at 07:00 and 08:00 UTC; the API accepts only the invocation that is actually 08:00 in `Europe/London`, so daylight-saving time is handled without changing the schedule twice a year.

## Test now

```bash
APP_BASE_URL=https://your-loop-service.example \
CRON_SECRET=your-secret \
SAVINGS_WATCH_MODE=full \
node scripts/run-savings-rate-watch.mjs
```

## Lifecycle

A product missing once becomes `PENDING_WITHDRAWAL`. It is only changed to `WITHDRAWN` after three consecutive missing or stale observations. Product versions and source hashes are retained.
