# v27.91.2 - Savings match view SQL hotfix

Fixes the Supabase error:

`cannot change name of view column "requires_existing_customer" to "rate_delta"`

Postgres does not allow `CREATE OR REPLACE VIEW` to reorder or rename existing view columns. The savings deal match preview is a read-only helper view, so the migration now explicitly drops it before recreating it.

## Run order

1. `db/v27_91_2_savings_match_view_hotfix.sql`
2. `db/v27_91_savings_typeahead_deals.sql`

The full v27.91 SQL in this package has also been corrected to drop the view before recreating it.
