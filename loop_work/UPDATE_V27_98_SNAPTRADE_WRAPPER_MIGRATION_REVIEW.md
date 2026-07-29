# LOOP v27.98 — SnapTrade wrapper-aware migration review

This update hardens the manual investment → SnapTrade import path.

## What changed

- SnapTrade account import now matches manual accounts by provider + wrapper/account type + holdings overlap + value similarity.
- A Trading 212 GIA import can suggest archiving the existing manual Trading 212 GIA, while a Trading 212 ISA remains separate.
- Import review modal explains the archive behaviour before import.
- Manual pots/holdings are archived, not deleted, when superseded by SnapTrade.
- Archived manual records are excluded from portfolio totals/charts/readings.
- If provider/realtime access is lost, SnapTrade imported accounts can be archived and the earlier manual inputs restored.
- Supports unlimited connected broker accounts because every SnapTrade account is keyed by its external account ID, not by provider alone.
- Adds migration metadata columns for wrapper type, match strength and user-confirmed archive decisions.

## SQL

Run:

```sql
db/v27_98_snaptrade_wrapper_migration_review.sql
```

This supersedes v27.97; if v27.97 has not been run, v27.98 includes the archive/restore schema it needs.
