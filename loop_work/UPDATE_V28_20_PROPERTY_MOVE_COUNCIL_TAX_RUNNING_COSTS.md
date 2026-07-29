# v28.20 — Property move council tax, running costs and mortgage estimate polish

## What changed

- Moving-home URL ingest now prefers explicit listing council-tax band text, especially `Council Tax Band: F` style fields.
- The parser is stricter so adjacent fields such as `Accessibility: Ask agent` should no longer become `Band A`.
- The listing title is cleaned down to the address/area where possible, for example `Marsh Brook Close, Rixton` rather than a long Rightmove/browser fallback title.
- If no listing image is available, the details modal uses an OpenStreetMap postcode map fallback where postcode geocoding succeeds.
- Moving-search records now support `primary_home`, `second_home` and `buy_to_let` contexts.
- Stamp duty now uses the second-property surcharge when the user marks the scenario as a second home or buy-to-let.
- Mortgage estimate now explains the basis: asking price minus deposit/equity, selected rate, selected term.
- The mortgage estimate card is clickable and opens a payment range.
- Running costs are broken down into mortgage, council tax, energy/heating, estate/management charges and a maintenance allowance.
- Moving costs now carry the basis: default 1.2% of purchase price, capped between £3,000 and £12,000, until manually overridden.

## SQL

Run after v28.19.1:

```sql
db/v28_20_property_move_council_tax_running_costs.sql
```

## Important note

Council tax confidence can only be 95%+ when LOOP has both the listing band and a local-authority annual amount/source. Where only the listing band is known, the UI keeps the source visible but still marks annual cost as an estimate until confirmed.
