-- v27.29 LoopHealth shared product cache + batch import support
-- Lets products without GTIN/barcodes be saved/reused globally by a stable product_key.

create extension if not exists pg_trgm;

alter table public.nutrition_product_catalog add column if not exists product_key text;
alter table public.nutrition_global_product_catalog add column if not exists product_key text;

update public.nutrition_product_catalog
set product_key = coalesce(
  product_key,
  case
    when coalesce(gtin, barcode) is not null then 'gtin:' || coalesce(gtin, barcode)
    else 'name:' || left(regexp_replace(lower(coalesce(brand_name,'') || ' ' || coalesce(product_name,'') || ' ' || coalesce(source_url,'')), '[^a-z0-9]+', '-', 'g'), 180)
  end
)
where product_key is null;

update public.nutrition_global_product_catalog
set product_key = coalesce(
  product_key,
  case
    when coalesce(gtin, barcode) is not null then 'gtin:' || coalesce(gtin, barcode)
    else 'name:' || left(regexp_replace(lower(coalesce(brand_name,'') || ' ' || coalesce(product_name,'') || ' ' || coalesce(source_url,'')), '[^a-z0-9]+', '-', 'g'), 180)
  end
)
where product_key is null;

create unique index if not exists nutrition_product_catalog_user_product_key_uq
on public.nutrition_product_catalog(user_id, product_key)
where product_key is not null;

create unique index if not exists nutrition_global_product_catalog_product_key_uq
on public.nutrition_global_product_catalog(product_key)
where product_key is not null;

create index if not exists nutrition_global_product_catalog_product_name_trgm_idx
on public.nutrition_global_product_catalog using gin (product_name gin_trgm_ops);

create index if not exists nutrition_global_product_catalog_brand_name_trgm_idx
on public.nutrition_global_product_catalog using gin (brand_name gin_trgm_ops)
where brand_name is not null;

notify pgrst, 'reload schema';
