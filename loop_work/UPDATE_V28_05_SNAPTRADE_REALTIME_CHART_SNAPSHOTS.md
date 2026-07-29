# v28.05 — SnapTrade realtime chart snapshots

This update separates two concepts clearly:

- SnapTrade gives LOOP the latest provider account/position state.
- LOOP must save those states as time-series snapshots if it wants proper user portfolio charts.

## Added

- Provider snapshot insertion on every SnapTrade import/refresh.
- New protected cron endpoint:
  - `/api/cron/snaptrade-position-snapshots`
- Vercel cron entry to run the provider snapshot job every 15 minutes.
- Realtime-tier enforcement inside the provider snapshot job.
- Backfill SQL to create one current snapshot for already-imported SnapTrade holdings.
- Wealth watch settings for provider snapshot cadence.

## Behaviour

When a user clicks **Refresh SnapTrade positions**, LOOP now:

1. Fetches current SnapTrade accounts/positions.
2. Updates the active investment account and holdings.
3. Writes a row into `investment_price_snapshots` for each returned holding.
4. Uses those rows to draw the account/holding chart.

The cron does the same in the background for eligible realtime users.

## Important note

SnapTrade current position data is not the same as a historical chart feed. For a smooth LOOP chart, the app needs to save provider snapshots over time. The first refresh creates one point; the second refresh creates the first line segment. Longer charts build as snapshots accumulate.

## Environment

Requires the existing cron secret:

```env
CRON_SECRET=use-a-long-random-secret
```

## SQL

Run:

```sql
db/v28_05_snaptrade_realtime_chart_snapshots.sql
```
