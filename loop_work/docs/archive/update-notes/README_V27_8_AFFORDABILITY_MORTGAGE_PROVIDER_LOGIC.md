# v27.8 - Affordability Lab mortgage provider logic

This patch improves the `Can you afford?` mortgage flow.

## What changed

- The Affordability Lab now reads the same month plan as Financial Flow rather than the older placeholder monthly item source.
- It pulls in:
  - household gross income;
  - current net month estimate;
  - fixed/regular Financial Flow costs;
  - childcare;
  - debt payments;
  - car/transport finance-looking costs;
  - student loan payroll override;
  - dependant children/adults;
  - current property value and mortgage balance where saved.
- Current mortgage payment is **not included in the affordability score** when the query is a replacement-home move.
- Current mortgage is only treated as a cost when the query suggests the old property is being kept/rented out/used as a second home.
- House queries now show:
  - loan required;
  - LTV;
  - income multiple;
  - new payment estimate;
  - stress payment estimate;
  - buffer after payment and stress payment;
  - rate/provider options;
  - provider-style affordability lenses.
- With an OpenAI integration token, the affordability coach can use `web_search_preview` to enrich mortgage product options. Without the token it falls back to built-in market planning bands.
- Saved logs now keep selected provider/rate fields, loan/LTV, mortgage products JSON and lender checks JSON.

## Migration

Run:

```sql
\i db/v27_8_affordability_mortgage_provider_logic.sql
```

## Notes

This is a planning estimate, not financial advice. The lender-style checks are not a substitute for a broker/lender affordability decision because individual lender calculators and credit policy can change.
