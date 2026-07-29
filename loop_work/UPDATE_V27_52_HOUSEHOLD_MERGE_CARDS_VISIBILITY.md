# v27.52 Household Merge + Card Visibility Fix

This patch fixes two connected issues:

1. `/nutrition/cards/<id>` returning 404 for cards that exist but belong to another active household member.
2. Accepted household invites showing a blank family tree because the newly joined account was not linked to an existing person profile or included in the household roll-up.

## Run SQL

Run this in Supabase:

```sql
-- db/v27_52_household_merge_cards_visibility.sql
```

Then verify:

```sql
select * from public.app_household_merge_healthcheck();
```

All rows should return `ok = true`.

## What changed

- `app_accept_household_invite` is dropped and recreated safely.
- Accepting an invite now:
  - joins the user to the household,
  - links to a matching adult person profile by email when it exists,
  - links the user's own self profile when they already have one,
  - creates a self profile if needed so the household tree is not blank.
- Household pages now load people across all active member accounts, not only the owner.
- Nutrition card list/detail pages can load cards from active household members.
- Wealth summary and Income page now aggregate across active household members where the member has income/finance visibility.
- RLS SELECT policies were added for household-safe card/people reads and permission-gated finance reads.

## Test order

1. Restart localhost.
2. Run the SQL above.
3. Accept the household invite again with a test user.
4. Open `/household` and confirm the existing family data plus the joined user profile appears.
5. Open the exact card URL that previously 404'd.
6. Check `/income`, `/accounts`, `/net-worth` and the wealth overview strip.

## Important note

Adult data remains owned by the adult account that created it. The household view now aggregates records across linked household members rather than moving everything into one owner account. That is the safer model for future privacy and permissions.
