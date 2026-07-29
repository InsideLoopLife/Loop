## Latest update

### v28.84 — User-chosen navigation and account modal
- Restored Financial Flow to the primary Wealth navigation.
- Restored the Wealth / Health switch in both side and top navigation.
- Replaced the clipped sidebar Account flyout with a full viewport modal.
- Added a one-time signed-in choice between side and top navigation.
- Added the permanent layout control to Account → Personal.
- Added cross-device choice tracking through `ui_navigation_layout_chosen_at`.

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


## Latest update

See `UPDATE_V28_89_PORTFOLIO_UI_HISTORY_INTERACTION.md` for the current portfolio layout, period-history, diversification and cost-basis interaction update.

## v28.92 code boundaries

The application now has non-breaking domain modules under `domains/` for
Identity/Account, Wealth, Health and shared Market data. Platform concerns such
as database clients, permissions and worker boundaries live under `platform/`.
Existing routes and database tables remain unchanged.

See `docs/CODE_DOMAIN_BOUNDARIES_V28_92.md` and run:

```bash
npm run check:boundaries
```
