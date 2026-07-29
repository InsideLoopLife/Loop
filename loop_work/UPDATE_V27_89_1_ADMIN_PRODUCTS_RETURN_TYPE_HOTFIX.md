# LOOP v27.89.1 — Admin Products return-type hotfix

Postgres does not allow an existing function's `RETURNS TABLE` shape to be changed with `CREATE OR REPLACE FUNCTION`.

The v27.89 product quality update expanded `loop_admin_products_list(integer)` to return extra fields for image caching, macros, micros, source URLs and admin editing. Existing databases may already have an older version of the function, so it must be dropped first.

## Run order

1. Run `db/v27_89_1_admin_products_return_type_hotfix.sql`
2. Then rerun the corrected `db/v27_89_product_images_quality_affordability_fix.sql` from this package.
3. Then continue with later migrations if they have not already been run.

## Also fixed in this package

- The corrected v27.89 SQL now drops `loop_admin_products_list(integer)` before recreating it.
- The admin helper `loop_v2789_is_admin()` has a corrected dynamic SQL string for checking admin email rows.
