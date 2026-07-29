# v27.67 Nutrition full rebuild integrated into LOOP

This update replaces the broken nutrition patch chain with a cleaned, compatible implementation.

## Files changed

- `components/nutrition/NutritionClient.tsx` — full replacement, no patch snippets.
- `lib/nutrition/v27_67/*` — new typed nutrition helpers.
- `app/api/nutrition/cards/*` — card search/detail/source refresh endpoints with legacy fallback.
- `app/api/nutrition/log/route.ts` — logs to the new `loop_nutrition_*` layer and mirrors into existing `food_logs` so Lifestyle/health totals still work.
- `app/api/nutrition/estimate/route.ts` — safe heuristic AI-entry starter, ready for paid tier/model guardrails later.
- `app/nutrition/cards/page.tsx` — cleaned card library page.
- `app/nutrition/cards/[id]/page.tsx` — direct card view now works for both new cards and existing `meals` records.
- `db/v27_67_nutrition_full_rebuild.sql` — new SQL layer.

## SQL to run

```sql
-- Supabase SQL editor
-- Run this full file:
db/v27_67_nutrition_full_rebuild.sql
```

Then verify:

```sql
select * from public.loop_v2767_nutrition_healthcheck();
```

## Behaviour changes

### Food logging

The modal now starts with just Quick Search / Ask AI. After a product/card is selected or built, the app shows date, wheel-style time picker, serving, people, meal slot and drink volume.

Drinks now require a volume unless a known serving option supplies it.

### Product vs recipe handling

Products do not show cooking-method prompts. Recipes and household meals stay private to the user/household. Products and ingredients can be shared database items.

### Allergens

`contains` and `may_contain` are now separate. For example, “May contain traces of peanuts, nuts and milk” is no longer treated as direct allergy content.

### Ingredient trees

Ingredients with sub-composition now expand inline instead of creating pointless info/star buttons.

### Product corrections

Submitting a source URL queues a richer source refresh designed to capture formal name, main image, ingredients, allergens, nutrition, price, currency and retailer.

## Notes

This package intentionally excludes `.env.local`. Keep your Supabase service role key only in local/Vercel/hosting environment variables.
