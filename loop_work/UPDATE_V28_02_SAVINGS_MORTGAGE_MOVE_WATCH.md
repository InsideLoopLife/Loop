# LOOP v28.02 — Savings, mortgage renewal and moving-search watch

## Summary
Adds the next wealth-planning layer requested for savings, mortgage renewals and moving-home research.

## Savings
- Adds daily 8am savings-rate watch cron at `/api/cron/savings-rate-watch`.
- Compares tracked savings accounts against sourced `savings_rate_deals`.
- Filters existing-customer-only deals using `user_financial_provider_relationships`.
- Uses balance and monthly top-up to estimate annual gain.
- Shows AI savings rate watch cards on `/accounts`.
- Adds feature flag seed: `savings_rate_watch`.

## Mortgage renewals
- Adds daily 8:10 mortgage renewal watch cron at `/api/cron/mortgage-renewal-watch`.
- Checks variable mortgages and fixed deals approaching the end date.
- Compares current lender and whole-market source rows from `mortgage_rate_deals`.
- Stores user recommendations in `mortgage_renewal_recommendations`.
- Shows renewal radar cards on `/mortgage`.
- Adds feature flag seed: `mortgage_renewal_watch`.

## Moving / property searches
- Adds `property_move_queries` and `property_move_query_events`.
- Adds an “I’m looking at houses” flow to the House page.
- User can save a listing URL or rough price without changing their current-home affordability score.
- Saves assumptions for price, deposit/equity, stamp duty, mortgage payment, council tax, EPC/energy and notes.
- Adds detail modal for each saved query.
- Adds feature flag seed: `move_planner`.

## Deployment
Run:

```sql
db/v28_02_savings_mortgage_move_watch.sql
```

Then restart the app so Vercel cron and new routes are loaded.

## Notes
- This does not seed live savings or mortgage rates. It creates the structure and UI to consume admin/AI/source-logged rates safely.
- Recommendation logic is conservative: if a deal requires an existing provider relationship, it is only shown when the user has marked that provider as held.
- Moving searches are deliberately separated from current home scoring so exploratory house hunting cannot distort current affordability.
