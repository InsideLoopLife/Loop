# v27.66 Product allergens, source refresh, ingredient tree and edit-card fix

## Main fixes

### 1. May-contain allergens are separate from true allergens

A product source saying:

```txt
May contain traces of peanuts, nuts and milk
```

should create:

```txt
presence = may_contain
```

not:

```txt
presence = contains
```

UI should render this as a separate caution column, not as a direct allergy flag.

Use:

```tsx
components/nutrition/v27-66/AllergenColumns.tsx
```

### 2. Ingredients with bracketed make-up become expandable

Example:

```txt
lemon flavour topping (14%) [sugar, vegetable fats (palm kernel, palm, shea), rice powder]
```

becomes a parent row with expandable children.

Use:

```tsx
components/nutrition/v27-66/IngredientTree.tsx
```

Only branded/reusable items should link to "more information". Raw ingredients should not create pointless star/info boxes.

### 3. Product source URL now queues a richer scrape

When a user submits a URL to correct a product, queue:

```sql
select public.app_queue_product_source_refresh(
  '<card_id>'::uuid,
  'https://example.com/product',
  'User says current info is wrong'
);
```

It is designed to pull:

- main product image
- formal product name
- ingredients text
- allergen text
- nutrition text
- price amount
- price currency
- retailer/source host

The extraction helper is:

```txt
lib/nutrition/v27_66_source_harvest.ts
```

Wire it to an admin/background action or route handler. It deliberately sets harvested data to `needs_review` rather than blindly overwriting verified product nutrition.

### 4. Edit card error fix

The runtime error:

```txt
matchingSavedMeals is not defined
```

is fixed by adding a memoised declaration in `RecipeForm`.

Patch reference:

```txt
patches/NutritionClient.v27_66.matchingSavedMeals.fix.tsx
```

## Run SQL

```sql
db/v27_66_product_allergen_source_tree_fix.sql
```

## Verify

```sql
select * from public.app_v2766_healthcheck();
```

## Recommended UI behaviour

Product card allergen display:

- **Contains**: direct ingredient/source allergens only
- **May contain / traces**: precautionary labels only
- Do not merge may-contain into direct allergy flags

Ingredient display:

- raw ingredients: simple row
- ingredients with bracket content: expandable row
- branded product used inside recipe: link/product info

Product source correction:

- top-level product correction button
- source URL input
- status chip: queued / processing / needs review / applied
