# LOOP v27.96 — SnapTrade account import flow

This update fixes the confusing post-connection state.

A SnapTrade callback only means LOOP has permission to access the broker connection. It does not automatically create local investment pots, because a single brokerage login can return multiple accounts. Users now get a clear connected-accounts panel on the Investments page where they can review and import each account.

## Changes

- Added `/api/snaptrade/accounts` to fetch connected brokerage accounts and positions.
- Added `/api/snaptrade/sync` to import selected accounts into `investment_accounts` and `investment_holdings`.
- Added provider/account external IDs so imports can be refreshed without duplicating accounts.
- Investments page now shows a SnapTrade account review/import panel when connected.
- Users can import one account, refresh one account, or import all returned accounts.
- The SnapTrade callback page now points users to “Review/import accounts” instead of implying the portfolio is already populated.

## SQL

Run:

```sql
db/v27_96_snaptrade_account_import_flow.sql
```

## Notes

This intentionally does not auto-import every brokerage account after callback. A Trading 212 connection can return multiple accounts/pies/wrappers, and users should decide which are visible in LOOP.
