# V28.18 - Investment pie organiser, pension settings, cash/ISA and provider transaction logic

## What changed

- Added a user-facing **Organise into pies** action on investment pots.
- Users can manually assign SnapTrade/Trading 212 imported holdings into local LOOP pie labels when the broker does not expose Trading 212 pie membership.
- Replaced confusing `P/L pending provider cost basis` language with clearer **Performance unavailable with an explanation that the broker has not supplied verified original-cost data** messaging.
- Added account-level cash display for imported broker accounts where SnapTrade/account payload provides cash or where cash can be inferred from account balance minus positions.
- Added ISA allowance display placeholders from provider/raw payload fields where available.
- Added pension pot settings so users can edit contribution frequency, pay-in day, paused/left-job dates, valuation mode and contribution assumptions.
- Added DB pension settings so public schemes use rule templates and private schemes can attach a private rules/source URL for that user's account only.
- SnapTrade sync now stores provider tax-lot data as investment purchase lots where available, so future date-bought/amount-bought analysis can use broker data rather than only current holdings.

## Important behaviour

- LOOP will not invent Trading 212 pies. It only groups holdings when the user maps them or when real group metadata exists.
- Performance is hidden when the broker does not supply verified original-cost/cost-basis data. This prevents false large losses/gains.
- Cash and ISA allowance depend on what the provider exposes. The UI is ready; where the provider does not expose it, LOOP shows nothing rather than guessing.

## SQL

Run after v28.17:

```sql
db/v28_18_investment_pie_pension_cash_isa_logic.sql
```
