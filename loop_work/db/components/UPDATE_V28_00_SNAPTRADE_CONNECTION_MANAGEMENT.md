# V28.00 SnapTrade connection management and manual restore

This update adds user-facing integration management inside Account → Integrations and hardens the SnapTrade account import flow.

## Included

- Account → Integrations tab.
- User can remove a SnapTrade provider connection from LOOP.
- Removing a provider archives imported SnapTrade accounts and restores linked manual accounts where migration records exist.
- User can hide a single imported SnapTrade account without removing the whole provider connection.
- User can restore archived manual investment pots directly.
- Callback now saves each SnapTrade connection by its own connection ID rather than overwriting the latest connection row.
- SnapTrade account previews now dedupe across repeated connections using provider, wrapper, institution account ID/account number and display value.
- Imported SnapTrade accounts store `external_institution_account_id` when available.
- Migration archives duplicate SnapTrade connection rows and duplicate imported SnapTrade accounts without deleting history.

## Trading 212 behaviour

A single SnapTrade connection can return more than one account if the broker credentials expose multiple accounts. LOOP should therefore support unlimited connected accounts, but it should only count active accounts. Hidden/archived imported accounts are excluded from totals and charts.

If a broker/API key only exposes one wrapper, users can connect another key/connection. LOOP dedupes repeated stale imports and lets the user remove old access.

## SQL

Run:

```sql
db/v28_00_snaptrade_connection_management.sql
```
