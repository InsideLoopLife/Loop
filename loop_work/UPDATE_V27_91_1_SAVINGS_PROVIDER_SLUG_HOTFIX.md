# v27.91.1 - Savings provider_slug SQL hotfix

Fixes the Supabase SQL error thrown by v27.91:

```text
ERROR: 42703: column "provider_slug" does not exist
DETAIL: There is a column named "provider_slug" in table "user_financial_provider_relationships", but it cannot be referenced from this part of the query.
```

## Cause

The v27.91 migration assumed `financial_accounts.provider_slug` had already been added by v27.87, then used unqualified column names in an `INSERT ... SELECT`. If that column was missing, Postgres interpreted `provider_slug` as the target-table column and rejected it from the SELECT scope.

## Fix

- Adds the savings columns to `financial_accounts` again using `add column if not exists`.
- Qualifies the source table as `fa.provider_slug`, `fa.provider`, `fa.user_id`.
- Adds a standalone hotfix SQL file.
- Corrects the full v27.91 SQL file so it can be rerun safely.

## Run order

If v27.91 has already failed, run:

```sql
db/v27_91_1_savings_provider_slug_hotfix.sql
```

Then rerun the corrected full migration if you want the whole file to complete cleanly:

```sql
db/v27_91_savings_typeahead_deals.sql
```
