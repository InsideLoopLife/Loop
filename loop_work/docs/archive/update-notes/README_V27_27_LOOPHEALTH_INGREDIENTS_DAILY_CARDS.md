# V27.27 – LoopHealth ingredients, daily quick cards and recipe route fix

## Fixes

- Weekly/daily score quick-click cards now only show foods that were actually logged on the selected day. If nothing is logged today, no quick cards appear under the score.
- Food/recipe images now prefer the direct image URL in `<img>` instead of always routing through the image proxy. This avoids proxy failures on otherwise valid image URLs such as Open Food Facts and recipe CDN images.
- Kept graceful fallback to the generated food tile if the image URL fails.
- Added legacy `/nutrition/card/[id]` redirect to `/nutrition/cards/[id]` so old/singular links do not 404.

## Ingredients / products database

- Added a new `nutrition_ingredients` table for reusable ingredients, drinks and product-like items.
- Direct foods logged from quick search or URL import are captured into this ingredient database where possible.
- Added `/nutrition/ingredients` as a dedicated ingredient/product library.
- Cards now separate recipes from ingredients/products more clearly using `card_kind`.

## URL import behaviour

- The log-food fallback URL importer now requests an `ingredient/product` import when used from the quick-log flow.
- Menu import still works as before from the dedicated menu import flow.
- This helps URLs like product pages, ingredient pages and specialist sources become reusable ingredients instead of being mislabelled as menu/takeaway recipe cards.

## Migration

Run:

```sql
-- db/v27_27_loophealth_ingredients_cards_day_quickfix.sql
```

This creates `nutrition_ingredients` and adds `meals.card_kind`.

## Validation

A full production build was not completed in this sandbox because dependency installation timed out. This patch was applied against v27.26 and inspected statically.
