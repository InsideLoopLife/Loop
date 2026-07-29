# v27.70 Product import ZIPs, price refresh and shopping-list planning

This update builds on v27.69 and keeps the restored nutrition UI. It improves the backend/import logic so the Aldi, Lidl and Tesco generated ZIP packages can be uploaded directly.

## Compatibility check against your three files

| File | Products | Source URLs | Price values | Image URLs supplied | Image harvest mode | Alcohol products | Ingredients present | Contains allergen rows | May-contain rows |
|---|---:|---:|---:|---:|---|---:|---:|---:|---:|
| loop_aldi_food_drink_import_csvs.zip | 156 | 156 | 154 | 0 | fetch_from_aldi_source_page | 20 | 156 | 0 | 0 |
| loop_lidl_food_drink_import_csvs.zip | 75 | 75 | 36 | 0 | fetch_from_source_page | 18 | 75 | 23 | 13 |
| loop_tesco_food_drink_import_csvs.zip | 48 | 48 | 48 | 0 | fetch_from_source_page | 0 | 12 | 6 | 1 |

## What was wrong with v27.69 for these files

v27.69 worked for the simple CSV template, but these retailer files are richer LOOP multi-CSV packages. They include `import_cards`, `source_snapshots`, `serving_options`, `source_allergens`, quality files and category queue files.

The old mapper would have imported the basic product name/calories fields, but missed important columns such as:

```txt
display_name
formal_name
brand_name
category_path
shop_tag
retailer_article_number
dedupe_key
serving_label
serving_ml
serving_g
package_count
product_size_text
main_image_url
image_harvest_mode
contains_allergens_source
may_contain_allergens_source
ingredients_text
price_amount
price_text
nutrition_json
is_alcohol
abv_percent
```

v27.70 maps and stores these.

## New / changed code

```txt
lib/nutrition/imports/zip.ts
lib/nutrition/imports/package.ts
lib/nutrition/imports/normalise.ts
lib/nutrition/imports/types.ts
lib/nutrition/imports/enrichment.ts
lib/nutrition/imports/priceRefresh.ts
lib/shopping/planner.ts
app/api/cron/product-price-refresh/route.ts
app/api/shopping/plan/route.ts
app/admin/product-imports/actions.ts
app/admin/product-imports/page.tsx
scripts/product-price-refresh-worker.mjs
db/v27_70_product_import_price_shopping.sql
supabase/migrations/202606230070_product_import_price_shopping.sql
```

## How import now works

The admin import page accepts:

```txt
.csv
.zip
```

If a ZIP is uploaded, it looks for:

```txt
*_import_cards.csv
*_source_snapshots.csv
*_serving_options.csv
*_source_allergens.csv
*_quality_summary.csv
*_field_mapping.csv
*_category_queue.csv
```

The `import_key` links the support files to the product row.

## Product database storage

Products are stored in:

```txt
loop_nutrition_cards
```

Supporting data is stored in:

```txt
loop_product_import_batches
loop_product_import_rows
loop_nutrition_source_snapshots
loop_nutrition_serving_options
loop_nutrition_card_ingredients
loop_nutrition_card_allergens
loop_nutrition_price_observations
loop_nutrition_card_facts
```

## Image handling

Your three retailer files have `main_image_url` blank, but they do have a source URL and image harvest mode.

v27.70 stores:

```txt
image_harvest_mode
source_url
source_host
image_alt
```

and queues cards for image harvest during enrichment or the price/image refresh cron.

Important: some retailers render images/prices with client-side scripts or bot protection. The cron does not attempt to bypass anti-bot systems. Where pages block automated requests, use official APIs, feeds, affiliate/product feeds, or manual/source uploads.

## Price refresh cron

New endpoint:

```txt
/api/cron/product-price-refresh
```

Required env:

```txt
LOOP_CRON_SECRET=make-a-long-random-secret
LOOP_APP_URL=https://insideloop.life
```

Call with:

```bash
curl -H "Authorization: Bearer $LOOP_CRON_SECRET" "https://insideloop.life/api/cron/product-price-refresh?limit=20&delay_ms=750"
```

Or run:

```bash
npm run worker:product-prices
```

The cron records each run in:

```txt
loop_product_price_refresh_runs
```

and stores price observations in:

```txt
loop_nutrition_price_observations
```

## Shopping-list planning

New logic:

```txt
lib/shopping/planner.ts
app/api/shopping/plan/route.ts
```

It aggregates repeated needs, so multiple recipes needing chicken become one total, then candidate products are compared on:

```txt
required quantity
pack size
waste
price
unit price
retailer/source
```

Example API request:

```json
{
  "needs": [
    { "name": "chicken breast", "quantity": 400, "unit": "g" },
    { "name": "chicken breast", "quantity": 400, "unit": "g" }
  ]
}
```

The response can recommend something like:

```txt
2 × 400g sliced chicken breast
1 × 1kg chicken breast pack
```

sorted by cost first, then waste.

## Run SQL

```sql
db/v27_70_product_import_price_shopping.sql
```

Then check:

```sql
select * from public.loop_v2770_import_price_shopping_healthcheck();
```
