# LOOP v27.97 — SnapTrade manual migration/archive guard

This update hardens the SnapTrade import path so manually entered investments are not double-counted when a broker account is imported.

## What changed

- Adds reversible `record_status` archive columns to `investment_accounts` and `investment_holdings`.
- Adds `investment_provider_migrations` as an audit trail between manual accounts and imported SnapTrade accounts.
- SnapTrade account previews now suggest likely matching manual pots/accounts.
- The import panel can archive selected manual accounts during provider import.
- Archived manual accounts/holdings remain in the database but are excluded from active investment page readings.
- Admin downgrade/tier-removal logic calls `loop_restore_manual_investments_for_user` so manual rows are restored and SnapTrade imported rows are archived when provider access is lost.
- A helper `loop_reactivate_snaptrade_investments_for_user` exists for future billing/webhook restore flows.

## SQL

Run:

```sql
db/v27_97_snaptrade_manual_migration_archive.sql
```

## Notes

This avoids automatic blind merging. LOOP suggests matches; the user chooses whether to archive matching manual rows. That protects households with multiple Trading 212 accounts, ISAs/GIAs/pies, or manually curated portfolios.
