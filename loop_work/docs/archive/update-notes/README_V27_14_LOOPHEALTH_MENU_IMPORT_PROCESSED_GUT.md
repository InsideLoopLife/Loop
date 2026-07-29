# V27.14 – LoopHealth menu importer + processed/gut scoring

This patch adds the next LoopHealth iteration around restaurant/menu products, processed-food scoring and gut-health scoring.

## What changed

### 1) Menu / restaurant / bakery URL import
Added a new bulk-import flow for cases where:
- barcode/product search does not find the item;
- it is not a supermarket product;
- it is not a recipe the user made themselves;
- the item exists on a public menu page, restaurant page, bakery page or takeaway page.

The Nutrition page now has an **Import menu** button in the recipe card area. The modal accepts:
- menu / restaurant / bakery URL;
- source name, e.g. Rudy's, Greggs, local café.

It calls the new route:

`app/api/nutrition/menu-import/route.ts`

The route:
- authenticates the user;
- rate-limits imports;
- fetches visible page text where possible;
- uses the saved OpenAI token with web search to structure the menu;
- returns up to 40 item/product candidates;
- estimates deep nutrition per item;
- extracts/infer allergens where possible;
- marks items as restaurant/menu estimates with lower confidence.

### 2) Bulk save menu products
Added:

`bulkAddNutritionMeals`

in:

`app/nutrition/actions.ts`

Selected menu items are saved into `meals` as reusable product/recipe cards with:
- source URL;
- brand/source name;
- menu price in metadata;
- ingredient/description text;
- deep nutrition estimate;
- allergen flags;
- restaurant/menu confidence reason.

No new DB migration is required because this reuses existing `meals` fields.

### 3) Processed-food score
Added derived scoring in:

`lib/nutrition/scoring.ts`

New function:

`scoreProcessedFood(...)`

The score is 0–100 where higher means higher processed-food load. It considers:
- processing level;
- salt;
- added sugar;
- saturated fat;
- trans fat;
- energy density;
- processed ingredient / commercial menu flags;
- fibre and protein as balancing factors.

### 4) Gut-health score
Added:

`scoreGutHealth(...)`

The score is 0–100 where higher means more gut-supportive. It considers:
- total fibre;
- soluble fibre;
- potassium, magnesium and calcium;
- added sugar;
- salt;
- saturated fat;
- glycemic impact.

### 5) AI-style recommendations
Added:

`nutritionBalanceRecommendations(...)`

The Nutrition dashboard now shows:
- processed load card;
- gut health card;
- more specific coach recommendations when salt, processed load, fibre, caffeine or added sugar are out of balance.

### 6) Recipe cards now surface derived scores
Saved recipe/product cards now show:
- nutrition score;
- processed load;
- gut-health score;
- existing deep flags/allergens.

## Files changed

- `components/nutrition/NutritionClient.tsx`
- `app/nutrition/actions.ts`
- `app/api/nutrition/menu-import/route.ts`
- `lib/nutrition/scoring.ts`
- `README_V27_14_LOOPHEALTH_MENU_IMPORT_PROCESSED_GUT.md`

## Notes

- This is intended for menu/product estimation, not clinical nutrition advice.
- Restaurant menu values are estimates and should be lower confidence than label/barcode data.
- Build reached successful compile and TypeScript validation. Full prerender failed locally because Supabase environment variables are not available in the sandbox.
