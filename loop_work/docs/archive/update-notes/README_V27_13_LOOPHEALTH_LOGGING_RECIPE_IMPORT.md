# V27.13 – LoopHealth logging + recipe import polish

This patch focuses on the nutrition flow changes requested for LoopHealth.

## What changed

### 1) Empty-day scoring now starts at 0 / 100
- When no food/drink has been logged for the selected day, the dashboard now shows:
  - **score = 0**
  - label **Not started**
  - helper snippet explaining that nothing has been logged yet.
- This avoids showing a misleading neutral score before water/food has been added.

### 2) Food logging now supports branded / searched products
- The **Log food / drink** modal now supports:
  - quick product search
  - retailer/deep search
  - choosing a returned product candidate
  - logging that result directly without first saving a recipe card.
- This means items like **Greggs sausage roll** can be searched and logged in a similar way to recipe cards.

### 3) Person selection is now multi-select and icon based
- Replaced the old single dropdown with selectable chips/cards.
- Supports:
  - **Household/shared**
  - one person
  - multiple people
  - **Select all** shortcut
- Linked users are visually marked.

### 4) Linked users receive an approval notification
- When food is allocated to a person that has their own linked account, the app now attempts to create an **app notification** so they can review / accept the entry.
- This uses the admin Supabase client when a service/admin key is present.
- If the admin key is not configured, the nutrition log still succeeds and the notification step is skipped quietly.

### 5) Meal slot is now icon based
- Replaced the dropdown with quick buttons for:
  - Breakfast
  - Lunch
  - Dinner
  - Snack
  - Drink
  - Meal

### 6) Recipe card modal simplified toward custom vs import flow
- Added a top-level split between:
  - **Custom recipe**
  - **Import recipe**
- Custom recipe flow now supports:
  - entering the recipe name
  - AI-assisted ingredient suggestions
  - per-ingredient accept / reject
  - accept all / reject all for untouched suggestions
  - adding manual ingredients
- Import recipe flow now supports:
  - recipe URL
  - image URL placeholder input for scanner/photo-led import evolution
  - AI-assisted recipe import

### 7) New recipe import API route
- Added:
  - `app/api/nutrition/recipe-import/route.ts`
- This route uses the saved OpenAI integration token (when configured) to:
  - suggest likely ingredients from a recipe title
  - infer recipe title + ingredients from a URL/image URL prompt
- It falls back safely if no token is configured.

## Files updated
- `components/nutrition/NutritionClient.tsx`
- `app/nutrition/actions.ts`
- `app/nutrition/page.tsx`
- `app/api/nutrition/recipe-import/route.ts`

## Notes / caveats
- The “image scanner” import is currently implemented as an **image URL input placeholder**, not full file upload OCR yet.
- Notification creation depends on a configured **Supabase admin/service role key**.
- Full `next build` reached successful compile + TypeScript validation in the container, but the later page-data collection stage timed out in this environment.
