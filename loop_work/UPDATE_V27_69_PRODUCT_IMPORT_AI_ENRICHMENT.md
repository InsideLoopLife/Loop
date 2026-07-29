# v27.69 Product Import + AI Enrichment Queue

This update adds a safe admin workflow for importing food/drink products from CSV exports before applying them to the shared product library.

## Run SQL

```sql
-- Supabase SQL editor
db/v27_69_product_import_ai_enrichment.sql
```

Then check:

```sql
select * from public.loop_v2769_product_import_healthcheck();
```

## New admin route

```txt
/admin/product-imports
```

The main `/admin` page now links to this importer.

## What the flow does

1. Upload CSV exported from Excel.
2. Rows land in staging tables, not the live product library.
3. The importer tries to match existing products by barcode, source URL, then brand/name.
4. Admin can run enrichment on the next 25 rows.
5. Enrichment uses source URL harvesting and, if configured, OpenAI. If no key is present it uses conservative heuristics.
6. Admin applies ready rows to the shared product library.
7. Existing verified product data is not overwritten in the default `missing_only` mode.

## Tables added

```txt
loop_product_import_batches
loop_product_import_rows
loop_product_import_enrichment_jobs
loop_nutrition_card_facts
```

The migration also adds these columns to `loop_nutrition_cards`:

```txt
barcode
category
import_batch_id
import_row_id
enrichment_status
enrichment_note
last_enriched_at
data_quality_status
```

## CSV fields supported

```csv
product_name,brand,product_type,category,serving_size,serving_unit,prepared_volume_ml,pack_size,barcode,source_url,image_url,ingredients,allergens,may_contain,calories,protein_g,carbs_g,fat_g,fibre_g,sugar_g,added_sugar_g,saturated_fat_g,salt_g,sodium_mg,caffeine_mg,price,retailer,notes
```

## Product library rules

Shared globally:

```txt
products
ingredients
branded drinks
barcode/source imports
supplements
```

Kept private in existing nutrition flows:

```txt
recipes
freehand meals
family meal cards
takeaway/menu estimates
```

## AI / enrichment behaviour

AI can fill missing expected values, ingredient trees and source-derived facts, but it does not blindly overwrite verified product data.

All enriched values are stored with:

```txt
source_kind
confidence
is_estimated
source_url
notes
```

This allows the UI to show when something is estimated rather than verified.

## Environment variables

Optional:

```txt
OPENAI_API_KEY=...
LOOP_PRODUCT_IMPORT_AI_MODEL=gpt-4.1-mini
```

Without these, the enrichment button still works using conservative heuristic estimates and source harvesting.
