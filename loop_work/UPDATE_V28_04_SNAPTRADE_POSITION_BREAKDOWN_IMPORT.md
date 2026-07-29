# v28.04 - SnapTrade position breakdown import

This update replaces the account-value-only SnapTrade import behaviour with position-first importing.

## What changed

- SnapTrade account refresh now tries the current `/positions/all` endpoint first.
- Falls back to `/positions`, then legacy `/holdings` if needed.
- Imported SnapTrade accounts now create one LOOP holding per returned stock/ETF/fund/crypto position.
- Account-value placeholder rows remain only when SnapTrade returns a balance/value but no positions yet.
- When positions later become available, the placeholder is archived and the individual holding cards replace it.
- Position metadata is parsed from both current and legacy SnapTrade shapes.
- If SnapTrade exposes a pie/portfolio/group label, it is saved into `group_label`; LOOP then shows it using the existing pie-stack UI.
- Imported positions are cleaned up on refresh: provider holdings missing from the latest SnapTrade response are archived rather than deleted.
- The SnapTrade import review modal now previews the returned positions before import.
- Imported SnapTrade investment pots now include a “Refresh SnapTrade positions” button.

## SQL

Run:

```sql
db/v28_04_snaptrade_position_breakdown_import.sql
```

## Test flow

1. Deploy the code and SQL.
2. Open Investments.
3. Click **Refresh SnapTrade positions** on the imported Trading 212 pot.
4. If SnapTrade returns positions, the placeholder row is archived and replaced with stock/ETF cards.
5. If SnapTrade still returns only account value, the placeholder remains and the review modal explains that positions are pending.
