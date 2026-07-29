# V27.11 — LoopHealth barcode/product lookup

This update adds a packaged-food lookup layer to the Nutrition card flow.

## What changed

- Recipe/product card modal now has a barcode/product lookup box.
- Lookup path is:
  1. Barcode/GTIN lookup against Open Food Facts.
  2. Product-name search against Open Food Facts.
  3. Optional retailer/manufacturer research using the saved OpenAI token.
  4. Manual label entry/photo URLs where database coverage is missing.
- Product matches can populate:
  - product name
  - brand
  - barcode/GTIN
  - image URL
  - ingredients
  - serving size/package quantity
  - nutrition estimate
  - allergen/dietary/manufacturing flags
  - confidence score/reason
- Saved products build a private `nutrition_product_catalog` cache per user.
- Recipe cards now store source/confidence metadata and label image references.

## Migration

Run:

```sql
 db/v27_11_loophealth_barcode_product_database.sql
```

## Notes

Retailer pages and manufacturer pages are useful, but they should be treated as evidence, not a permanent truth source. Product recipes, allergens, pack sizes and nutrition tables change. The UI now stores confidence and allows user-verified label status so the app can prefer user-checked data over a generic database result.

Future app version can replace image URL fields with direct camera upload + OCR, then ask the user to confirm the extracted ingredient/nutrition panel before saving.
