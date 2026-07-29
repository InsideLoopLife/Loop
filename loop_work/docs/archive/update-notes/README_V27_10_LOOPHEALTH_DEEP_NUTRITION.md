# V27.10 — LoopHealth Deep Nutrition

This patch expands Nutrition from a simple macro/micro estimate into a fuller food-quality model.

## Added

- Deep carbohydrate hierarchy:
  - total carbs
  - total fibre
  - soluble fibre
  - insoluble fibre
  - total sugar
  - added sugar
  - natural sugar
- Lipid quality profile:
  - total fat
  - saturated fat
  - trans fat estimate
  - monounsaturated fat
  - polyunsaturated fat
  - omega 3
- Hidden/processed-food markers:
  - sodium
  - potassium
  - calcium
  - iron
  - folate
  - niacin
  - thiamin
  - energy density
  - glycemic impact score
- Ingredient transparency:
  - estimated mass ratios by ingredient
  - ingredient role
  - confidence by ingredient
- Behavioural and safety flags:
  - allergen flags
  - dietary/behavioural flags
  - manufacturing notes
  - confidence reason
  - processing level
- Commercial food fallback logic for things like croissants/bakery items when a user only enters a product name.
- Updated AI recipe-estimate prompt so OpenAI is asked for the full deep nutrition structure rather than basic macro/micro fields only.
- Updated recipe card and edit modal UI to show the deeper breakdown.

## Migration

Run this migration after v27.9:

```sql
\i db/v27_10_loophealth_deep_nutrition.sql
```

## Notes

The nutrition model remains a planning estimate, not clinical advice. Exact values should still be checked against labels, especially for allergens, sodium, trans fats and commercial bakery products.
