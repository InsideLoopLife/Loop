# LoopHealth feature guide

LoopHealth is the health side of Loop. It focuses on reusable recipe/product cards, daily food logs, nutrition scoring and long-term pattern coaching.

## Core flows

### Add recipe
- Use **Add recipe** for a household recipe.
- Choose **Custom recipe** to type a dish name and let AI suggest ingredients and method steps.
- Choose **Import recipe** to paste a recipe URL or image URL. The importer reads public page evidence, JSON-LD recipe data and images where possible, then uses the saved OpenAI token to structure ingredients, servings, method and nutrition.
- The user can accept/reject ingredient suggestions and edit servings before saving.

### Log food
- Use **Log food** for daily entries.
- Search a branded product or drink first.
- If nothing is found, paste a restaurant/product/menu URL. LoopHealth acknowledges the import, shows progress states and can save results as meal cards.
- Quick-searched/imported products are auto-saved as reusable meal cards, so they can show as previously used later.

### Saved meal cards
- Saved cards store serving rules, image/source details, ingredients, allergen flags, dietary flags, confidence notes and deep nutrition estimates.
- Cards can be edited or logged again.

### Daily nutrient detail
- Click the daily score or **Examine all nutrients** to open `/nutrition/day`.
- This shows macros, minerals and vitamins against current default targets.
- Later, targets should be personalised from age, sex, height, weight, goals, activity and Apple Health data.

## Scoring

### Diet balance
Uses protein, fibre, soluble fibre, vitamins/minerals, salt, added sugar, saturated fat, trans fat, caffeine and glycemic impact.

### Processed load
Lower is generally better, but the app avoids treating all processing as bad. The score weighs pastry, fried foods, processed meat, additives, salt, low fibre and high energy density.

### Gut health
Uses fibre, soluble fibre, plant/legume/fermented signals, and adjusts down for low fibre/high processed load.

## Integrations roadmap

Apple Health remains a future native app integration. It should help with BMR, active energy, workouts, mindful minutes and exercise-aware food coaching.
