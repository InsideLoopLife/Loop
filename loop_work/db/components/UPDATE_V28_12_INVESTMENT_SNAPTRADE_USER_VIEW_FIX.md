# UPDATE V28.12 — Investment / SnapTrade user-view fixes

## Why this update exists
The investment page was showing some provider-imported accounts as if every holding had a reliable price/cost basis. That can create false portfolio totals and false gain/loss numbers when SnapTrade/Trading 212 returns account-level value in one shape and holding-level positions in another.

This update makes LOOP treat provider values as the source of truth for imported account totals, and makes holding-level cards safer and cleaner.

## User-facing changes

### Investment totals
- Imported SnapTrade accounts now use the provider/account total where available.
- If the provider total is higher than returned positions, LOOP shows a cash/unmapped note rather than pretending the missing value is gain.
- Portfolio gain/loss is neutralised for provider-imported positions when a reliable cost basis is not returned.
- UK/London pence/GBX values are guarded so a value like `19.25p` is not treated as `£19.25`.
- THG/LSE-style tiny pound prices and pence prices are both handled more safely.

### Cleaner portfolio cards
- Removed the messy blue “imported snaptrade / exported value / cost” line from every holding card.
- Provider-synced holdings now show a short neutral line only.
- `quote source` labels are replaced with quick market-state labels where possible:
  - orange: early market
  - green: live market
  - purple: after market
  - grey: closed / priced daily
- Expanded ticker logo lookup map so common imported holdings display logos again where a domain is known.

### Pies / groups
- Pie/group holdings are bundled by default.
- The user sees one pie summary card first.
- The user can open the pie to inspect individual stocks and allocation.

### Broker imports moved to Integrations
- The investment page no longer shows the full connected-accounts import block.
- It now links users to `/integrations`.
- `/integrations` now includes a Broker account import panel where users can:
  - connect/manage SnapTrade
  - refresh returned accounts
  - import ISA/GIA/SIPP accounts separately
  - import all shown accounts
  - archive likely duplicate manual pots during import

### User-first layout
- Investments now default to the current user/self view where available.
- The default area is user investments rather than household.
- Household/shared pots are moved to the end of the people filter.
- User tabs are labelled more clearly as:
  - User investments
  - User pensions
  - Defined benefit

## Technical changes

### SnapTrade sync
- Adds account-level computed values into `external_account_raw`:
  - `loop_balance_value`
  - `loop_holdings_value`
- Adds safer position normalisation:
  - implied provider price from value ÷ units
  - cost basis detection where SnapTrade exposes it
  - GBX/LSE guardrails
  - pie/group label extraction from more possible provider shapes
- Stores provider cost basis as `imported_invested_value` only where available.

### Portfolio rendering
- `accountDisplayValue()` prefers provider account totals for SnapTrade accounts.
- `accountUnmappedValue()` identifies provider value not mapped to returned holdings.
- `holdingCost()` avoids false P/L when provider import lacks reliable cost basis.
- `InvestmentAccount` server query now includes `external_connection_id` and `external_account_raw`.

## How to import more than one Trading 212 account
1. Go to **Integrations**.
2. Open **Broker account imports**.
3. Click **Connect / manage broker** if Trading 212 is not connected.
4. Click **Refresh accounts**.
5. If SnapTrade returns ISA and GIA separately, import each one or click **Import selected**.
6. LOOP creates separate investment pots for each imported account.

If only one account appears, refresh the broker connection in SnapTrade/Trading 212 and confirm that both ISA and GIA are enabled/visible to the provider.

## Notes
This update does not remove manual accounts automatically unless the user explicitly ticks a likely duplicate during provider import. Archived manual records remain restorable if provider access is removed later.
