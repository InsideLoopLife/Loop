# v27.85.2 People relationship constraint hotfix

Fixes a Supabase migration failure where `app_household_members.role = parent` was being copied into `people.relationship`.

`people.relationship` is constrained to `self`, `partner`, `child`, or `other`, so household permission roles such as `parent`, `owner`, `admin`, and `member` must be normalised before insert.

Run order after v27.85.1:

1. `db/v27_85_2_people_relationship_constraint_hotfix.sql`
2. `db/v27_85_house_product_pension_household_fix.sql`

The full v27.85 SQL in this package has also been corrected so it no longer writes `parent` into `people.relationship`.
