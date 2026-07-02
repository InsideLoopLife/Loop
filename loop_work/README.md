## Latest update

### v28.14 — Admin form accessibility + Supabase admin-key detection
- Fixed low-contrast house/mortgage modal forms by using solid panels and stronger label/input colour.
- Added placeholders/helper copy to valuation and mortgage/rate forms.
- Updated Supabase admin-key detection to accept both service-role JWTs and newer `sb_secret_...` keys.
- House admin now renders in safe read mode instead of hard-blocking the whole page when the server admin key is missing/invalid.

# v27.65 Food Log SQL Fix 2

This fixes the v27.64 error:

```txt
ERROR: 42601: VALUES lists must all be the same length
LINE 379: 'allergen_validation',
```

The allergen policy seed row was missing one boolean value.  
This file also avoids expression-based `ON CONFLICT` for the serving-size seed rows.

## Run this

```sql
-- db/v27_65_food_log_sql_fix_2.sql
```

## Verify

```sql
select * from public.app_v2765_healthcheck();
```

## Test

```sql
select public.app_food_serving_options_for_query('red bull sugarfree');
select public.app_food_serving_options_for_query('hype sauce');
select public.app_food_log_drink_volume_required('drink', 'drink_product', null, null);
```


## v27.91.2 SQL hotfix
Run `db/v27_91_2_savings_match_view_hotfix.sql` before rerunning `db/v27_91_savings_typeahead_deals.sql` if Supabase complains about changing the savings match view column order.

## v28.10 note

Adds `/admin/future-integrations` for LOOP Inbox / Email-to-LOOP provider setup, DNS checklist and product launch tasks. Run `db/v28_10_loop_inbox_postmark_admin_checklist.sql` after v28.08 and v28.09.

## v28.13 update

Adds Admin > House for provider-light mortgage catalogue refresh, user-reported mortgage deal quality loop, admin-domain nav pages for Investments / House / Savings, and UPRN/EPC/council-tax setup guidance.

Run:

```sql
db/v28_13_ai_mortgage_catalogue_admin_reorg.sql
```

### v28.17 — Property move planner + mortgage comparison hardening
- Better listing title, council-tax band, EPC and image extraction for saved moving-home searches.
- Moving-home cards now show image, score, price/mortgage/running costs and a More details comparison modal.
- Mortgage deals now have search/filter and selectable comparison with adjustable term and optional absorbed costs.
- Archived moving-home searches are queued for deletion after 14 days via `/api/cron/property-archive-cleanup`.
- Run `db/v28_17_property_move_confidence_mortgage_compare.sql` after v28.16.

## V28.18 - Investment pie organiser, pensions, cash and ISA tracking

Adds manual pie mapping for provider-imported holdings, pension pot settings, DB pension rule-source handling, provider cash/ISA fields and SnapTrade purchase-lot capture where the broker exposes lot/transaction data. Run `db/v28_18_investment_pie_pension_cash_isa_logic.sql` after the v28.17 migration.

## v28.20 - Property move council tax/running-cost polish

Run after v28.19.1:

```sql
db/v28_20_property_move_council_tax_running_costs.sql
```

This improves moving-home URL ingestion, council-tax band/source confidence, map fallback, primary/second-property assumptions and the clickable mortgage-payment range.
