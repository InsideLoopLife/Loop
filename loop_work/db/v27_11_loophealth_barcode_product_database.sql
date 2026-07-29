-- V27.11 — LoopHealth barcode/product database
-- Adds packaged-food product lookup metadata to recipe cards and a private user cache.
-- Data sources can include Open Food Facts, retailer/manufacturer research, label photos and manual/user-verified corrections.

alter table meals add column if not exists barcode text;
alter table meals add column if not exists gtin text;
alter table meals add column if not exists brand_name text;
alter table meals add column if not exists product_data_source text;
alter table meals add column if not exists product_data_confidence integer not null default 0;
alter table meals add column if not exists product_image_url text;
alter table meals add column if not exists product_source_url text;
alter table meals add column if not exists product_lookup_json jsonb not null default '{}'::jsonb;
alter table meals add column if not exists label_front_image_url text;
alter table meals add column if not exists label_ingredients_image_url text;
alter table meals add column if not exists label_nutrition_image_url text;
alter table meals add column if not exists user_verified_label boolean not null default false;
alter table meals add column if not exists product_recipe_version text;

create table if not exists nutrition_product_catalog (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  barcode text,
  gtin text,
  product_name text not null,
  brand_name text,
  source text not null default 'manual_label',
  source_url text,
  image_url text,
  front_image_url text,
  ingredients_image_url text,
  nutrition_image_url text,
  ingredients_text text,
  serving_label text,
  package_quantity text,
  data_confidence integer not null default 0,
  lookup_json jsonb not null default '{}'::jsonb,
  user_verified boolean not null default false,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table nutrition_product_catalog enable row level security;

drop policy if exists nutrition_product_catalog_select_own on nutrition_product_catalog;
create policy nutrition_product_catalog_select_own on nutrition_product_catalog for select using ((select auth.uid()) = user_id);
drop policy if exists nutrition_product_catalog_insert_own on nutrition_product_catalog;
create policy nutrition_product_catalog_insert_own on nutrition_product_catalog for insert with check ((select auth.uid()) = user_id);
drop policy if exists nutrition_product_catalog_update_own on nutrition_product_catalog;
create policy nutrition_product_catalog_update_own on nutrition_product_catalog for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists nutrition_product_catalog_delete_own on nutrition_product_catalog;
create policy nutrition_product_catalog_delete_own on nutrition_product_catalog for delete using ((select auth.uid()) = user_id);

create unique index if not exists nutrition_product_catalog_user_gtin_uq on nutrition_product_catalog(user_id, gtin) where gtin is not null;
create unique index if not exists nutrition_product_catalog_user_barcode_uq on nutrition_product_catalog(user_id, barcode) where barcode is not null;
create index if not exists nutrition_product_catalog_user_product_idx on nutrition_product_catalog(user_id, product_name);
create index if not exists nutrition_product_catalog_user_brand_idx on nutrition_product_catalog(user_id, brand_name);
create index if not exists meals_user_barcode_idx on meals(user_id, barcode) where barcode is not null;
create index if not exists meals_user_product_data_source_idx on meals(user_id, product_data_source, created_at desc);

notify pgrst, 'reload schema';
