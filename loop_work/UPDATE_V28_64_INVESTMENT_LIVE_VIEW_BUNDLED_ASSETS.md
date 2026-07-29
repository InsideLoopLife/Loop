# v28.64 — Investment live view bundled assets

## Fixes

- Bundles the same stock/ETF/fund in the live investment view when the user owns it in more than one pot/account.
- Groups by ISIN first, then ticker + exchange, then asset name fallback.
- Shows one row per bundled asset instead of duplicate rows.
- Uses summed value and summed units for the bundled row.
- Shows weighted average cost per unit where cost basis is present.
- Uses bundled rows for the ticker strip, diversification notch bar, portfolio summary and holdings table.
- Keeps underlying pot/holding records separate; the bundling is presentation-only.
- Expands logo lookup paths and adds fallback logo domains for common stocks/ETFs including G4M, Apple, Alphabet, Meta, Nvidia, Microsoft, Amazon, Cisco, BMO, TD and Vanguard.
- Replaces “command centre” copy with “live view” / “portfolio view” language.
- Clarifies investment worker logs: the worker fetches/reuses one global quote, then writes holding-value snapshots for each owned holding because units/value are user/pot-specific.

## SQL

No schema changes required. Run:

```sql
db/v28_64_investment_live_view_bundled_assets.sql
```
