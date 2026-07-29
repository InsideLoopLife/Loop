# V27.30 – LoopHealth batch import progress + shared product cache polish

## Why
Batch imports were useful but felt opaque: a user could click run and not see items appear as they were being created. Menu pages such as Rudy's / TenKites can also expose only part of the menu unless the extraction prompt is exhaustive and has a second pass.

## Changes

### Batch import live log
- `components/nutrition/BatchProductImportClient.tsx` now shows a live import log.
- Rows are marked as queued/checking/created/warning/failed.
- Product/ingredient line imports appear one-by-one as each lookup completes.
- URL/menu imports reveal extracted items progressively after the source returns.
- Each row shows title, status, detail and an image/placeholder.

### Exhaustive menu extraction
- `app/api/nutrition/menu-import/route.ts` now accepts:
  - `itemHints`
  - `exhaustive`
- Menu imports now ask for all visible categories/sections and up to 120 items.
- If a menu import returns fewer than 18 items, the API runs an extra exhaustive AI pass and merges results.
- The prompt is clearer for TenKites / `viewthe.menu` style JavaScript menus.

### Barcode / GTIN product lookup
- `app/api/nutrition/product-lookup/route.ts` now gives OpenAI a stronger GTIN-specific instruction when a numeric barcode is searched.
- The source order is explicit: brand/manufacturer → UK retailer → Open Food Facts/GS1 → reputable nutrition/product listings.
- Energy drink / powder lookups ask for caffeine and vitamin data where available.

### Saving into reusable databases
- `bulkAddNutritionMeals` now records imported products/menu items into the personal ingredient/product table as well as meal cards.
- With a Supabase service/secret key configured, confident rows are also written to the global shared catalogue so other users can find them without another web lookup.

## Supabase key note
Use a server-only key only. Supported env names in this project:
- `SUPABASE_SECRET_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_SERVICE_KEY`

Never expose these as `NEXT_PUBLIC_*`.
