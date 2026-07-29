# v27.68 Restore Nutrition UI + Clean v27.67 Integration

This release fixes the v27.67 integration mistake where the full NutritionClient replacement removed the existing daily nutrition dashboard, nutrition snapshots, gut-health/processed-load panels, recipe cards and legacy meal images.

## What changed

- Restored the existing `components/nutrition/NutritionClient.tsx` interface and data flow.
- Restored the existing `/nutrition/cards` and `/nutrition/cards/[id]` pages so legacy `meals` cards, recipe cards and product images remain visible.
- Removed the broken patch folder and example route/action files that were not meant to be compiled.
- Folded the `matchingSavedMeals` fix into the real component by removing the stray saved-match JSX from the wrong form scope.
- Kept the v27.67 backend support files and SQL for future shared product/ingredient tables.
- Kept the improved v27.67 API fallbacks for new `loop_nutrition_*` cards and legacy `meals` cards.
- Updated recipe/card detail allergen display so direct `contains` and `may contain / traces` warnings are shown separately.

## Important

Run this on top of the current broken v27.67 install to restore the previous UI. Existing Supabase data is not deleted.

## SQL

Run if it has not already been run:

```sql
select * from public.loop_v2767_nutrition_healthcheck();
```

If that function does not exist, run:

```sql
db/v27_67_nutrition_full_rebuild.sql
```

Then rerun the healthcheck.
