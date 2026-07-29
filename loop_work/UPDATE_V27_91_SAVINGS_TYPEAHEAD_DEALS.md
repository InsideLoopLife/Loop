# UPDATE V27.91 - Savings typeahead, ongoing/deal toggle and provider eligibility

## Summary
- Replaced the savings provider dropdown with a typeahead combobox.
- The provider list opens as soon as the user starts typing.
- Selected providers now show recognisable logo initials and common account/product suggestions.
- Added an **Ongoing / Boost-deal** toggle.
- Ongoing savings accounts hide fixed start/end/rate-end dates.
- Boost/deal savings accounts show deal start, deal end and boost/rate end fields.
- Added logged savings deal support so admin/AI can record market savings offers and compare them against user accounts.
- Added "Who do you already bank with?" provider chips so LOOP can later filter deal recommendations by eligibility.
- Added a Better-rate watch section that compares logged deals to the user's account/provider context.

## SQL
Run:

```sql
db/v27_91_savings_typeahead_deals.sql
```

## New/changed data model
- `financial_accounts.deal_duration_mode`
- `financial_accounts.savings_rate_deal_id`
- `financial_accounts.source_deal_url`
- `financial_accounts.eligibility_note`
- `user_financial_provider_relationships`
- `savings_rate_deals`
- `loop_savings_deal_match_preview`

## Notes
The rate-deal table is intentionally empty until admin/AI logs real offers. This avoids seeding stale savings rates. Once deals are logged, users will see better-rate suggestions filtered by existing-provider eligibility.
