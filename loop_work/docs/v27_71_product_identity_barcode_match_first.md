# v27.71 Product identity, barcode scanning and match-first AI logic

## Lookup order

```txt
1. Admin-verified LOOP product library
2. Imported CSV/ZIP product library
3. Barcode/GTIN exact match
4. Open Food Facts barcode lookup
5. GS1 identity / Digital Link validation
6. Retailer source URL / affiliate/provider adapters
7. AI estimate only if no credible product match exists
```

So a prompt like:

```txt
I've had a pasta meal from Aldi that was cheese pesto pasta bake
```

should search imported Aldi/Lidl/Tesco/library items first and return candidates. It should not immediately create an AI-made-up product.

## Run SQL

```sql
db/v27_71_product_identity_barcode_match_first.sql
```

Verify:

```sql
select * from public.loop_v2771_product_identity_healthcheck();
```

## New routes

```txt
POST /api/products/resolve
POST /api/products/barcode/lookup
GET  /api/products/gs1-link?gtin=...
POST /api/nutrition/estimate  (updated match-first version)
```

## Barcode scanning

Component:

```txt
components/product/BarcodeScanner.tsx
```

It uses native `BarcodeDetector` where available and falls back to manual barcode entry.

## Match-first UI

Component:

```txt
components/nutrition/ProductMatchFirstSearch.tsx
```

Use this inside the food logging modal/search area to force product matching before AI fallback.

## GS1

This update validates GTIN check digits and creates a GS1 Digital Link URL:

```txt
https://id.gs1.org/01/<gtin14>
```

Full Verified by GS1/GDSN master data generally needs commercial/partner access, so the adapter is prepared but disabled unless you add:

```env
GS1_API_BASE_URL=...
GS1_API_KEY=...
```

## Open Food Facts

Barcode lookup uses:

```txt
https://world.openfoodfacts.org/api/v3/product/<barcode>.json
```

Add a clear user agent:

```env
OPEN_FOOD_FACTS_USER_AGENT=InsideLoop/0.1 (support@insideloop.life)
```

## Behaviour in `/api/nutrition/estimate`

If local/import/provider candidates exist, the route returns:

```json
{
  "mode": "match_first",
  "candidates": []
}
```

It does not create an AI-estimated card.

Only when no credible product match exists does it create a low-confidence `ai_estimate` card.
