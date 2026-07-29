# UPDATE v27.89 — product image caching, quality admin, investment price sanity and affordability scoring

## Admin products

- Product quality edits now go through an admin-checked server action and security-definer RPC fallback, so RLS no longer blocks saves to `loop_product_quality_snapshots`.
- Added `product-images` Supabase Storage bucket support.
- When an admin saves a product/ingredient tile with an external image URL, the app attempts to import/cache the image into app-owned storage.
- The original external image URL is retained as `source_image_url` so admin can see where it came from.
- Added a cog-style quality editor on every product/ingredient tile.
- Added admin archive/remove action so tiles can be hidden from the product quality database without deleting underlying user history.
- Product cards now classify `Product`, `Ingredient`, `Meal card`, and `Recipe`; recipe/profile-specific cards are excluded from the main admin product database view by default.
- Product scoring now includes image, nutrition, macro nutrients, micro/ingredient detail, verified source and confidence.
- Added macro/micro fields to the quality override form.
- Digested source URLs are shown on the card for admin sense-checking.

## Investments

- Edit holding now shows native price where available, rather than showing GBP-equivalent price in a USD input.
- Exchange-traded holdings with suspicious provider/fund factsheet URLs are treated as suspect.
- Known sanity guard added for NIO/NYSE style rows where a provider NAV was being used as a stock quote.
- Saving a suspicious exchange-traded row tries to repair the value through market quote lookup and records a note.
- Switching household/person filter no longer leaves `Investment stocks` selected when the newly selected person has no investment pots but does have pension/DB data.

## House affordability

- Replaced the simple affordability label with a 100-point single-vs-dual income framework.
- Score now breaks down:
  - housing payment vs net income
  - total debt/outgoing load including detected childcare
  - provisional emergency buffer
  - loan-to-value
  - maintenance runway
  - income shock stress test
  - residual income
- The House hero and map now show a clickable affordability score.
- Clicking the score opens a modal explaining points per criterion and the reason for each score.

## SQL

Run:

```sql
 db/v27_89_product_images_quality_affordability_fix.sql
```

This adds the product quality columns, admin save/archive RPCs, and the updated admin product listing RPC.
