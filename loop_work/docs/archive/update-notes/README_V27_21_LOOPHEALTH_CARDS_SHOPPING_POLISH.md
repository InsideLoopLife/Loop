# V27.21 – LoopHealth cards, shopping and image polish

## Changes

- Added a dedicated saved recipe / product card library at `/nutrition/cards`.
- Added search and card-type filtering for recipes, products and menu/takeaway imports.
- Updated the main LoopHealth hero so **Meal cards** opens the card library instead of hiding saved cards underneath the daily log.
- Changed the weekly balance UI into a compact, swipeable, width-based week strip. On small screens the selected day auto-centres.
- Ingredient suggestions are now editable before saving:
  - amount / quantity
  - ingredient name
  - notes / exact variant such as Graham's Gold Top milk, 5% mince, decaf, etc.
- Product search results now show a star when the matching food/card already exists in the saved database.
- Food-log thumbnails now fall back to a styled food tile rather than showing a broken/blank external image.
- Recipe/page image extraction is more robust and now handles meta tags regardless of attribute order.
- Removed duplicate notification insert in `logFoodEntry`.
- Shopping checklist now supports freehand ingredients and combines matching ingredient names.
- Shopping checklist now adds rough indicative prices and a rough total where exact supermarket pricing is unavailable.

## Notes

The grocery cost logic is intentionally indicative for now. Exact supermarket pricing still needs a later provider/API layer or an AI-backed price research endpoint with caching.
