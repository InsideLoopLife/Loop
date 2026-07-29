# v27.44 — LoopHealth Data Quality Engine

This update focuses on the nutrition/product issues found during localhost testing.

## What changed

### Product / recipe / ingredient separation
- Adds `entity_type` across meals, food logs and reusable nutrition ingredients.
- Supports: `ingredient`, `product`, `drink_product`, `meal`, `recipe`, `saved_meal_card`, `logged_serving`.
- Saved cards now allow quick type toggles between ingredient/product.

### Powdered drink and fluid logic
- GFuel Hype Sauce 2.0 now has a known powdered-drink profile.
- A logged `500ml drink of GFuel Hype Sauce 2.0 at 11am` is treated as:
  - Product: `GFuel Hype Sauce 2.0`
  - Serving: one scoop / about 6.2g
  - Prepared fluid: 500ml
  - Caffeine: 140mg
  - Calories: 15 kcal, unless later corrected by a submitted label/source
- Drink volume and time are parsed from freehand text and prefilled.

### Better freehand parsing
- Removes serving phrases such as `500ml drink of` from product titles.
- Parses `at 11`, `11am`, `11:05`, etc.
- Detects drinks from coffee, latte, GFuel, energy drink, shake, juice, milk, etc.

### Product correction queue
- Adds `nutrition_product_corrections` table.
- Product/card pages now include a label/source correction box.
- Submitting a source URL queues the product for correction and marks the item as queued.

### Saved image persistence
- Logging continues to persist `image_url` against both food logs and reusable cards.
- The update keeps product/card image metadata in the reusable record so refreshes do not need to rediscover the image.

### Nutrient glimpse
- Saved cards and ingredient/product pages now show more nutrient detail at a glance:
  - calories
  - protein
  - carbs
  - sugar
  - fibre
  - saturated fat
  - salt
  - caffeine

### Recipe method generation
- Recipe cards without method steps now show `Generate method`.
- Recipe detail pages include `Generate method` and `Re-check recipe` actions.

## Files changed

- `lib/nutrition/product-data.ts`
- `app/api/nutrition/product-lookup/route.ts`
- `app/api/nutrition/recipe-estimate/route.ts`
- `app/nutrition/actions.ts`
- `components/nutrition/NutritionClient.tsx`
- `app/nutrition/cards/page.tsx`
- `app/nutrition/ingredients/page.tsx`
- `components/nutrition/RecipeDetailClient.tsx`
- `db/v27_44_loophealth_data_quality_engine.sql`
- `supabase/migrations/202606220001_loophealth_data_quality_engine.sql`

## Run order

1. Replace your local project with this updated copy or merge the changed files.
2. Run the SQL migration in Supabase/local DB:
   - `db/v27_44_loophealth_data_quality_engine.sql`
   - or `supabase/migrations/202606220001_loophealth_data_quality_engine.sql`
3. Restart localhost.
4. Test:
   - `I've had a 500ml drink of GFuel Hype Sauce 2.0 formula at 11am.`
   - Expected: product title is clean, time prefilled, drink volume 500ml, calories 15, caffeine 140mg.
5. Test card correction:
   - Open saved cards or ingredients/products.
   - Submit a source URL in the correction box.
   - Expected: item status is queued in `nutrition_product_corrections`.

## Not fully automated yet

The correction queue stores submissions and marks records queued. The background worker that reads the submitted source/label and replaces nutrition automatically still needs to be connected to your AI/product scraping flow. This was left intentionally as a queued workflow so wrong data is not auto-overwritten without a controlled processor.
