# V28.06 — Investment chart point storage admin controls

This update adds an admin surface for controlling investment chart point storage and seeing how much database space those points use.

## Added

- New admin tab: `/admin/investment-storage`
- Settings for:
  - enabling/disabling automatic chart point storage
  - minimum minutes between stored points
  - retention days
  - maximum points per holding
  - market-hours-only snapshots
  - realtime/paid-user-only snapshots
- Database usage card for `investment_price_snapshots`
  - actual table/index size via `loop_admin_investment_snapshot_usage()` once migration is installed
  - safe fallback estimate if the RPC has not been installed yet
- Manual prune button to remove old/excess chart points
- Automatic cron runner now respects the stored settings and prunes after running

## Manual vs stored chart behaviour

Manual/current orientation is still useful for a live portfolio breakdown and pie by holding/account. Stored points are different: they persist the value at intervals so historical chart movement, hover points and per-stock changes can be reconstructed without guessing.

## Migration

Run:

```sql
\i db/v28_06_investment_snapshot_storage_settings.sql
```

or paste the SQL into Supabase SQL editor after the v28.05 migration.
