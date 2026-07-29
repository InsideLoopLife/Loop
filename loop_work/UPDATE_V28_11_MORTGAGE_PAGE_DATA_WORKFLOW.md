# LOOP v28.11 - Mortgage page and source workflow

## What changed

- Reworked `/mortgage` into a clearer current-home dashboard.
- Replaced the hard-to-read dark headline affordability block with four readable mortgage summary cards:
  - mortgage balance
  - mortgage payment
  - deals available
  - improvements
- Removed the duplicated full-page affordability score card. The score remains clickable on the property map.
- Added page tabs:
  - House overview
  - Mortgage deals
  - Moving home
  - Valuation sources
- Rebuilt Mortgage deals as a full-page tab with:
  - renewal radar
  - watch-ready mortgage status
  - sourced deal cards
  - monthly cost, total initial-period cost, effective rate, fee, source/apply link
- Rebuilt Moving home as its own tab.
- Rebuilt Valuation sources as its own tab with valuation automation roadmap.
- Updated mortgage watch payload so recommendation cards can show term/cost metadata.
- Extended Admin > Future integrations / products to cover:
  - LOOP Inbox
  - Mortgage data and renewal watch
  - Property valuation automation
- Added check-off tasks that disappear once completed.

## SQL to run

Run after v28.10:

```sql
\i db/v28_11_mortgage_page_data_source_workflow.sql
```

or paste the file into Supabase SQL editor.

## How mortgage source logic should work

1. User has an attached mortgage record.
2. If `rate_type` is variable/tracker/SVR, it is watch-ready now.
3. If fixed, it becomes watch-ready when `initial_period_end` is within the configured alert window.
4. Admin/source jobs populate `mortgage_rate_deals`.
5. `runMortgageRenewalWatch` filters by:
   - user tier
   - LTV
   - current-lender vs wider-market availability
   - stale/active status
6. Recommendations are staged in `mortgage_renewal_recommendations`.
7. User sees cards in House > Mortgage deals.

## External work still needed

- Choose licensed mortgage data source for whole-market rows.
- Add/verify lender SVR/product-transfer sources.
- Connect automated source ingestion instead of relying on manual admin rows.
- Add regulated-advice wording before public launch.
- Choose valuation source stack:
  - HMLR open data first
  - exact address/UPRN provider second
  - optional paid AVM/provider for higher tier
