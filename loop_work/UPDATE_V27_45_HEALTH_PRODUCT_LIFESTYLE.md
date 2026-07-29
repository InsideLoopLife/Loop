# v27.45 Health Product Quality + Lifestyle OS + Household Join Fix

Run order:

1. Apply the DB migration:
   - `db/v27_45_health_product_lifestyle_household.sql`
   - or the matching Supabase migration file.

2. If household invite acceptance still shows an admin-key error locally, run:
   - `db/v27_8_household_invites_join_and_delete.sql`

   The updated code now uses the secure RPC fallback `app_accept_household_invite` when no server-side admin key exists.
   Alternatively add `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY` to `.env.local` on the server only.

What changed:

- Product cards no longer need or push cooking methods.
- Recipe cards can generate a method when missing.
- AI/freehand names are cleaned so prompts/URLs are not used as product titles.
- Freehand drink logs parse time and fluid volume, e.g. `500ml GFuel at 11am`.
- Saved card selection has been replaced by realtime card search.
- Log modal defaults to the person logging first, not Household/shared.
- Product correction queue added with status tracking.
- Product cards can show a queued/update clock badge.
- Label-image scan endpoint added for Nutrition/Supplement Facts images.
- Lifestyle OS gets a top-level daily/weekly/monthly green-tick summary and an AI insight placeholder.

Testing:

- Upload the GFuel Supplement Facts image via the label image input. It should read serving size 1 scoop / 6.2g, calories 5, carbs 2g, caffeine 140mg and sodium 80mg, not invent 30g maltodextrin.
- Log `I’ve had a 500ml drink of GFuel Hype Sauce 2.0 at 11am` and check:
  - product title is clean,
  - time pre-fills to 11:00,
  - drink slot is selected,
  - fluid is 500ml,
  - card becomes a product/drink product.
- Open a product card and confirm there is no method section.
- Queue a correction and check the status clock appears.
- Accept a household invite after applying the v27_8 RPC migration.
