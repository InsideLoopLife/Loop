-- LOOP v27.89.1 admin product list return-type hotfix
-- Postgres cannot change a RETURNS TABLE signature with CREATE OR REPLACE FUNCTION.
-- Run this once, then run the corrected db/v27_89_product_images_quality_affordability_fix.sql from this package.

drop function if exists public.loop_admin_products_list(integer);
