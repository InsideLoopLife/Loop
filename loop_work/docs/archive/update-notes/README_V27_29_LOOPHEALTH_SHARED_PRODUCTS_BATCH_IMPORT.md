# V27.29 — LoopHealth shared products, auto web fallback and batch import

## Product lookup behaviour

When a user searches a food/drink/product:

1. LoopHealth checks the user's saved recipe/product cards.
2. It checks the user's reusable ingredient/product database.
3. It checks the private household cache.
4. It checks the shared/global product cache.
5. It checks Open Food Facts with UK-first sources.
6. If no good/relevant match is found, it automatically uses the saved OpenAI token for UK retailer/manufacturer web research.

Selected or saved web-researched products are cached so the next lookup should not need a fresh web search.

## Shared/global product cache

Products without a barcode/GTIN now get a stable `product_key`, so entries like VIVE Orange Zero, G Fuel flavours, syrups and restaurant/menu products can be reused globally after being captured.

Requires migration:

```sql
\i db/v27_29_loophealth_shared_products_batch_import.sql
```

Global writes require a Supabase service/admin key. Without it, the user still gets private reusable products, but other users will not see them until a service key is configured.

## Batch checker

Added `/nutrition/batch` for:

- brand product ranges, e.g. Coca-Cola, G Fuel
- repeated ingredients, e.g. syrups, milk, espresso
- takeaway/menu imports

The batch checker can take a URL, a source name, or a list of product/ingredient names and prepares reusable cards.

## Card library UX

The saved card library now has clearer category tiles:

- all cards
- recipes
- ingredients/products
- takeaway menus

This should reduce confusion where an imported drink/product was previously displayed like a normal recipe.
