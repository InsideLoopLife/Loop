# V27.17 – LoopHealth recipe URL import / AI extraction fix

This patch fixes the issue where recipe import or dish-name suggestions could return placeholder ingredients like `main ingredient` instead of actual ingredients.

## What changed

### Recipe URL import now uses page evidence first
`app/api/nutrition/recipe-import/route.ts` now:
- fetches the public recipe URL server-side;
- extracts visible page text;
- extracts `application/ld+json` Recipe structured data where available;
- pulls `recipeIngredient`, nutrition anchors, yield/name/image where the page exposes them;
- passes that evidence to the saved OpenAI token for structured ingredient + nutrition extraction;
- falls back to web-search extraction for sparse rendered pages.

This means public recipe pages like Jamie Oliver recipe URLs should import real ingredients where the page exposes them, rather than generic placeholders.

### AI now returns nutrition estimate as part of recipe import
The recipe import endpoint now returns:
- recipe label;
- source URL;
- source name;
- image URL where available;
- real ingredient suggestions;
- a deep nutrition estimate;
- evidence counts so the UI can show whether the page was actually read.

### UI now applies imported estimate immediately
`components/nutrition/NutritionClient.tsx` now:
- updates the preview estimate after import;
- updates image URL/source URL from import results;
- shows source-read evidence in the assistant note;
- filters placeholder ingredient names out of the suggestion list.

### Ingredient suggestion box now behaves more naturally
Previously, suggested ingredients only appeared in the ingredient text box after being accepted. Now all non-rejected suggestions appear, so the user can remove/decline items rather than having to click every correct ingredient.

### Safer fallback ingredient logic
`lib/nutrition/scoring.ts` now includes more useful fallback patterns for:
- carbonara;
- bolognese/ragù;
- pancetta/guanciale/bacon;
- parmesan/pecorino/hard cheese.

This is not the main path when the OpenAI token is configured, but it prevents poor generic fallbacks if AI extraction fails.

## Files changed
- `app/api/nutrition/recipe-import/route.ts`
- `components/nutrition/NutritionClient.tsx`
- `lib/nutrition/scoring.ts`

## Database
No new migration required beyond v27.15.

## Validation
- `npx tsc --noEmit` passed.
- `npm run build` compiled and completed TypeScript, then timed out during Next page-data collection in the sandbox.
