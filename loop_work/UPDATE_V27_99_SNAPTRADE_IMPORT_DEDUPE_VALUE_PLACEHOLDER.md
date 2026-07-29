# v27.99 — SnapTrade import dedupe + account value placeholder

This update tightens the SnapTrade import flow after a provider is connected.

## Fixes

- Dedupes duplicate SnapTrade account previews before rendering the import panel.
- Marks a returned account as already imported if it matches an existing imported SnapTrade account by external ID or stable provider/wrapper/account label.
- If SnapTrade returns an account value but no position-level holdings yet, LOOP now creates/updates a temporary account-value holding so the imported account does not show £0.
- The temporary holding is clearly noted as a SnapTrade account-level placeholder and can be replaced on a later refresh when positions become available.
- Investment account cards now show a small top-right provider dot for imported accounts, e.g. `ST` for SnapTrade.

## Deploy

Run:

```sql
db/v27_99_snaptrade_import_dedupe_value_placeholder.sql
```

Then refresh `/investments` and use **Review / refresh account** on the imported SnapTrade account.
