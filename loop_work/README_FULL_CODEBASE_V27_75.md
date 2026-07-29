# LOOP v27.75 Full Codebase

This is a full integrated codebase, not a patch-only zip. It starts from the restored LOOP app code and folds in the recent work through v27.75.

## Included recent modules

- Restored nutrition UI and product/recipe cards
- Food log serving intelligence and SQL fixes
- Product import + AI enrichment
- Retailer ZIP import, price refresh and shopping-list planner
- Barcode/GTIN/GS1 identity and Open Food Facts lookup
- Match-first product logic before AI estimation
- Admin subdomain hardening and embedded live-readiness checklist
- Money strategy, savings deal library and daily 8am-style deal watch
- Admin notifications dashboard, uptime checker and user issue reporting
- Product quality tiles
- Investment coverage and SnapTrade health admin views
- Household homes/cars asset tracking
- Property estimate-first affordability mode

## Install locally

```bash
unzip LOOP-v27-75-FULL-CODEBASE.zip
cd LOOP-v27-75-FULL-CODEBASE
npm install
cp .env.example .env.local
npm run dev
```

## Database

If your database is behind by the recent updates, run:

```sql
db/RUN_CATCHUP_V27_62_TO_V27_75.sql
```

If the Supabase editor struggles with the combined file, run these in order:

```txt
db/v27_62_plan_admin_control_fix.sql
db/v27_63_food_log_ui_serving_intelligence.sql
db/v27_64_food_log_sql_fix.sql
db/v27_65_food_log_sql_fix_2.sql
db/v27_66_product_allergen_source_tree_fix.sql
db/v27_67_nutrition_full_rebuild.sql
db/v27_69_product_import_ai_enrichment.sql
db/v27_70_product_import_price_shopping.sql
db/v27_71_product_identity_barcode_match_first.sql
db/v27_72_admin_domain_money_strategy.sql
db/v27_73_money_daily_deal_watch.sql
db/v27_74_admin_ops_assets.sql
db/v27_75_property_estimate_mode.sql
```

Then check the latest health checks:

```sql
select * from public.loop_v2771_product_identity_healthcheck();
select * from public.loop_v2772_admin_money_healthcheck();
select * from public.loop_v2773_money_daily_watch_healthcheck();
select * from public.loop_v2774_admin_ops_assets_healthcheck();
select * from public.loop_v2775_property_estimate_healthcheck();
```

## Main new admin pages

```txt
/admin/security
/admin/notifications
/admin/product-imports
/admin/money-deals
/admin/money-deals/daily-watch
/admin/products/quality
/admin/investment-coverage
/admin/uptime
/admin/property-sources
```

## Main user pages

```txt
/nutrition
/account/plan
/account/money-strategy
/household/assets
/household/property-estimate
/help/report-issue
```

## Localhost vs live admin domain

Localhost remains usable. For live, set:

```env
NEXT_PUBLIC_SITE_URL=https://app.insideloop.life
NEXT_PUBLIC_ADMIN_URL=https://admin.insideloop.life
LOOP_PUBLIC_HOSTS=insideloop.life,app.insideloop.life
LOOP_ADMIN_HOSTS=admin.insideloop.life,localhost,127.0.0.1
LOOP_ALLOW_LOCAL_ADMIN=true
LOOP_ENFORCE_ADMIN_HOST=true
```

## Cron endpoints

Protected by `LOOP_CRON_SECRET`:

```txt
/api/cron/money-deals-daily
/api/cron/deal-news-review
/api/cron/admin-alerts-refresh
/api/cron/uptime-checks
/api/cron/product-price-refresh
```

`vercel.json` is included, but Vercel cron is UTC. Use an external scheduler for exact UK local time if needed.

## Notes

This package is generated as an integrated handoff. I have merged the middleware so the original beta access gate and Supabase session refresh are preserved while adding admin host and cron hardening.
