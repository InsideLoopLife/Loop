# LOOP v27.95 — SnapTrade callback + current-house affordability fix

## Fixes

- Added `/integrations/snaptrade/callback` so SnapTrade success redirects no longer 404.
- The callback stores the SnapTrade connection against `integration_connections` and marks the user's market-data provider status as `connected`.
- SnapTrade portal now uses the current app origin for the callback URL instead of hardcoding localhost.
- House affordability no longer uses the old future-purchase/default target mortgage in the score breakdown.
- The score now uses the selected/current house mortgage payment and current household outgoings.
- Child profiles are now passed into the affordability breakdown so the warning can distinguish:
  - no children detected
  - children detected but no childcare cost row entered
  - childcare costs tracked and included

## SQL

Run:

```sql
db/v27_95_snaptrade_callback_affordability_current_house_fix.sql
```

## Notes

The affordability score now reflects the current tracked home. Future purchase planning should remain outside the House page until the separate Future Purchase tab is built.
