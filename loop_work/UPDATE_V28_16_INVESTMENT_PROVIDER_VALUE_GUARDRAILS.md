# V28.16 — Investment provider value guardrails

This update fixes three issues seen in the Trading 212/SnapTrade portfolio view.

## 1) Do not invent pies

Previous builds created a fallback `Trading 212 ISA/GIA bundle` whenever a SnapTrade account returned lots of positions without pie metadata. That was too aggressive: not every Trading 212 holding is inside a pie, and SnapTrade may not expose Trading 212 pie membership.

New behaviour:

- Holdings are only bundled when `group_label` is explicitly present and is not an old generated bundle label.
- If no verified pie grouping exists, LOOP shows the holdings individually.
- The UI now explains that the user can use the Trading 212 pie import to map real app pies such as Daily Dividend or War Ready.
- The SQL cleanup clears old generated Trading 212 bundle labels and deletes their generated pie settings.

## 2) Do not show false P/L from provider imports

SnapTrade cost-basis fields can be incomplete, stale or wrapper-dependent. Showing `current value - imported cost basis` created misleading losses.

New behaviour:

- SnapTrade holdings are treated as unverified for cost basis by default.
- Provider imported account P/L displays `—` with a note instead of a false gain/loss.
- Household/user cards show `P/L pending provider cost basis` when a synced account is included.
- Manual holdings still show normal P/L.
- Future support can set `external_position_raw.loop_cost_basis_verified = true` only after a provider/account has been validated.

## 3) Align provider account value with broker total

Trading 212 account value can include cash. Earlier logic preferred summed positions before account balance, which made LOOP disagree with Trading 212.

New behaviour:

- SnapTrade account total now prefers account/balance total first.
- Position total is still stored as invested value.
- Any difference is shown as estimated cash/uninvested value.
- New SnapTrade sync stores `loop_cash_value` in the raw account payload.

## SQL

Run after v28.15:

```sql
db/v28_16_investment_provider_integrations_guardrails.sql
```

This clears generated fake Trading 212 bundle labels and removes obviously bad provider snapshots from the earlier GBX/value correction period.

## Integrations page split

`/integrations` is now user-facing only:

- Brokerage accounts
- Connection tracker

Admin/platform integration planning remains under Admin, especially Future Integrations and the product-specific admin areas.
