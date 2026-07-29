# V27.9 — LoopHealth nutrition scoring and recipe cards

Adds a dedicated LoopHealth nutrition area at `/nutrition`.

## Included

- New Health navigation item: **Nutrition**.
- Daily diet-balance gauge inspired by the ZOE-style score idea.
- Recipe cards with:
  - meal image URL / generated image prompt storage;
  - ingredients with quantities;
  - serving count;
  - adult serving multiplier;
  - child serving multiplier;
  - per-serving macros;
  - per-serving micros/minerals;
  - caffeine tracking for energy drinks/coffees;
  - recipe health score and confidence.
- Server-side recipe estimate endpoint:
  - uses the saved OpenAI token when available;
  - falls back to built-in ingredient heuristics if no token is saved or the AI call fails.
- Food/drink logging table so the daily score swings based on what was eaten.
- Coach snippets for protein, fibre, salt, sugar and caffeine balance.
- Apple Health roadmap panel noting that HealthKit sync should be handled in a future native app, not the web app.

## Migration

Run:

```sql
\i db/v27_9_loophealth_nutrition_recipe_scores.sql
```

or paste the contents into Supabase SQL editor before deploying this version.

## Notes

The nutrition estimate is for household planning and habit feedback, not medical advice. Product labels or a dedicated nutrition database should be used for precision-critical values.
