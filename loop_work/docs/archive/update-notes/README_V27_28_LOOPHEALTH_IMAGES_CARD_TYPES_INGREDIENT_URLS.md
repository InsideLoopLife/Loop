# V27.28 – LoopHealth images, card-type correction and ingredient URL imports

## Included

- Image rendering now uses a staged approach:
  1. try the real image URL directly in client UI,
  2. fall back to `/api/image-proxy` when hotlinking fails,
  3. fall back to `/api/food-image-placeholder` if the image still cannot load.
- Server-rendered card library, recipe detail and ingredients pages now use the image proxy for external images.
- Recipe/product edit modal now includes a **Card type** selector:
  - Recipe card
  - Ingredient / product card
  - Menu / takeaway card
- This lets you correct items like VIVE Orange Zero if they were imported as the wrong type.
- Ingredient suggestions now show smart detail prompts for:
  - espresso/coffee shot strength and volume
  - milk variants such as Graham’s Gold Top
  - mince fat percentage
  - syrups/flavourings and sugar-free vs full-sugar
  - high-fat ingredients such as oil, butter, cream and cheese
- Added an **Add ingredient from URL** flow inside the recipe editor so specialist products and syrups can be imported even when normal product search fails.
- Ingredient/product URL imports are saved as ingredient cards and can populate image, source URL, nutrition estimate and ingredient details.
- Auto-saved food products with placeholder images now update to a better image later if one becomes available.

## Notes

No new migration is required beyond v27.27.
