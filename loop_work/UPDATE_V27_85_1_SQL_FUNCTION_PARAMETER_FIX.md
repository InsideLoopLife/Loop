# v27.85.1 SQL function parameter hotfix

Supabase/Postgres rejected v27.85 because `CREATE OR REPLACE FUNCTION` cannot rename an existing input argument.

The failing helper was recreated in v27.85 with `value text`, while earlier migrations created it with `p_value text`.

## Fix

- Corrected `db/v27_85_house_product_pension_household_fix.sql` to use the original `p_value` parameter name.
- Added `db/v27_85_1_function_parameter_hotfix.sql` to drop/recreate the helper functions if your database is in a half-run state.

## Run order

If v27.85 failed at the helper function stage, run either:

1. The corrected full `db/v27_85_house_product_pension_household_fix.sql`, or
2. `db/v27_85_1_function_parameter_hotfix.sql`, then rerun the corrected full v27.85 SQL.

Because the failure occurred before the rest of v27.85 executed, the corrected full migration is normally the cleanest option.
