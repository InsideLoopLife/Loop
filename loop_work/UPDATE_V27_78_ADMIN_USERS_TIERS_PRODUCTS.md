# v27.78 Admin users, tiers, products and imports

## Why this exists

The old admin page was showing zeros because it was not reading Supabase `auth.users` through a safe admin RPC and tier requests were not connected to a real approval workflow.

This update adds a proper admin control layer.

## Run SQL

```sql
db/v27_78_admin_users_tiers_products.sql
```

Then check:

```sql
select * from public.loop_v2778_admin_users_tiers_products_healthcheck();
```

## New admin pages

```txt
/admin/control-centre
/admin/users
/admin/tiers
/admin/products
/admin/products/import
```

## Users and requests

`/admin/users` shows:

```txt
auth user ID
email
display name
current plan
household id
notification toggles
realtime market-data enabled
provider check mode
pending upgrade requests
user feature overrides
```

Tier requests are stored in:

```txt
loop_user_tier_requests
```

A user/app can create a request via:

```txt
POST /api/account/tier-request
```

Admin can approve/reject from `/admin/users`.

## Tier limits

`/admin/tiers` manages:

```txt
loop_plan_tiers
loop_plan_features
loop_user_feature_overrides
```

The app can read merged tier + user overrides via:

```sql
select public.loop_effective_user_entitlements('<user uuid>');
```

or API:

```txt
GET /api/account/entitlements
```

Example feature keys seeded:

```txt
ai_daily_requests
product_import_monthly
barcode_scans_daily
money_deal_watch
realtime_market_data
```

## Product admin

`/admin/products` uses a safe RPC to list/search/sort `loop_nutrition_cards` where present.

Sort modes:

```txt
newest
oldest
A-Z
Z-A
lowest confidence
highest confidence
```

## Product import brief

`/admin/products/import` embeds the import workflow. It supports the admin queue for:

```txt
single product URL
category URL
CSV / ZIP
feed/API
barcode batch
```

## Import logic for Tesco meal deals

The intended flow is:

```txt
1. Queue Tesco meal-deal category URL.
2. Discover product URLs.
3. Deduplicate by source URL, GTIN/barcode, retailer article number and name.
4. Fetch product page or official feed where available.
5. Extract image, title, brand, price, ingredients, allergens, macros/micros, serving and pack size.
6. Match existing LOOP product before creating anything new.
7. AI estimates only missing facts and marks confidence/source.
8. Stage products with ticks/crosses for review.
9. Admin applies reviewed products to the live library.
10. Cron later refreshes price/image/source status.
```

This avoids making products up while still allowing broad catalogue creation.
