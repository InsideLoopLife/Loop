# v27.63 Food logging UI + serving intelligence

## What changed

### Edit/log form layout

The intended edit form is now:

1. Sticky top bar with **Close** and **Save**.
2. Product image on the left.
3. Product title + compact date picker on the right.
4. Time wheel + avatar-based multi-person selector.
5. Meal slot + serving/drink volume.
6. Macro/micro nutrient snapshot.
7. Product actions:
   - See product
   - Search database
   - Correct product

This avoids needing to scroll to save.

### Time picker

Use:

```tsx
import { TimeWheelInput } from "@/components/nutrition/v27-63/TimeWheelInput";
```

It supports:
- wheel-style hour/minute/am-pm selection
- mobile scroll/swipe via native select wheels
- manual typed HH:mm entry
- a Now button

### Known serving sizes

Run:

```sql
select public.app_food_serving_options_for_query('red bull sugarfree');
select public.app_food_serving_options_for_query('hype sauce');
```

Starter seeds include:
- Red Bull Sugarfree 250ml can
- Red Bull Sugarfree 355ml can
- Red Bull Sugarfree 473ml can
- GFuel Hype Sauce 2.0 1 scoop / 500ml prepared drink
- GFuel Hype Sauce 2.0 1 scoop / 355ml prepared drink

### Drink volume rule

Run:

```sql
select public.app_food_log_drink_volume_required('drink', 'drink_product', null, null);
```

This returns `volume_required = true`.

The save action should block if a drink has neither:
- selected known serving option with ml/prepared ml, nor
- manually entered drink_volume_ml.

### AI model logic

New table:

```txt
app_nutrition_ai_resolution_policies
```

This separates:
- freehand food parsing
- product source resolution
- label image scan
- allergen validation

The important guardrail is that **allergens are not inherited from loose product categories**. They should only come from label/source evidence or explicit allergen ingredients.

### Product size naming

Use:

```sql
select public.app_food_display_name_with_size('Red Bull Sugarfree', null, 250, null);
-- Red Bull Sugarfree (250ml)
```

This means search can show:
- Red Bull Sugarfree (250ml)
- Red Bull Sugarfree (355ml)
- Red Bull Sugarfree (473ml)

rather than merging all sizes into one inaccurate product.

## Run order

1. Run:

```sql
db/v27_63_food_log_ui_serving_intelligence.sql
```

2. Verify:

```sql
select * from public.app_v2763_healthcheck();
```

3. Integrate the components into the current log/edit modal:
   - `TimeWheelInput`
   - `DateIconInput`
   - `PersonAvatarMultiSelect`
   - `ProductServingPicker`
   - `NutrientSnapshotGrid`

4. Use the example shell:

```tsx
components/nutrition/v27-63/FoodLogEditShell.tsx
```

as the target structure for the current edit food log modal/page.
