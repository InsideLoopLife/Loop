# V27.18 – LoopHealth AI recipe, weekly tanks and scoring patch

## Included

- Fixed OpenAI token lookup for LoopHealth routes:
  - accepts common provider aliases such as `openai`, `OpenAI`, `open_ai`
  - supports old development rows that still have `secret_value`
  - supports server env fallback via `OPENAI_API_KEY`, `OPENAI_TOKEN` or `LOOP_OPENAI_API_KEY`
- Recipe import now keeps using AI where available rather than falling back too quickly.
- Recipe URL import stores:
  - source URL
  - recipe image URL where available
  - servings/yield from structured recipe data where available
  - method / cooking instructions in `nutrition_json.instructions`
- Custom recipe creation now asks AI for actual ingredients and method steps rather than placeholders.
- Recipe cards now show a short **How to make it** preview when instructions exist.
- Recipe form now hides supermarket, shop-cost and product-label image fields unless the card is actually a bought/packaged product.
- Product/food cards now get an editable image URL, with a searched-style fallback image URL when no product image is returned.
- Added a weekly **daily balance tanks** header that fills by day and links into each day’s log.
- Added stronger processed-food/gut-health heuristics for obvious high-processing cases such as Greggs sausage rolls, pastry, fast food, takeaway and processed meats.
- Added the **Meal cards** button next to Add recipe / Log food in the top hero.

## Notes

- Daily scoring is deterministic from stored nutrition data. AI is used at import/estimate time to make that stored data richer; the daily score should not call AI on every page render.
- If the OpenAI token still appears missing, check that the same signed-in user has an active `integration_secrets` row, and that the deployment has the same `APP_ENCRYPTION_KEY` used when the token was saved.

## Checks

- `npx tsc --noEmit` passed.
- `npm run build` compiled and completed TypeScript, then timed out during Next page-data collection in the sandbox.
