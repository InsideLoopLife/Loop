-- V27.12 — LoopHealth product-data security and scale hardening
-- Adds a shared product cache and server-side rate-limit ledger for external nutrition lookups.

create table if not exists nutrition_global_product_catalog (
  id uuid primary key default gen_random_uuid(),
  barcode text,
  gtin text,
  product_name text not null,
  brand_name text,
  source text not null default 'open_food_facts',
  source_url text,
  image_url text,
  front_image_url text,
  ingredients_image_url text,
  nutrition_image_url text,
  ingredients_text text,
  serving_label text,
  package_quantity text,
  data_confidence integer not null default 0 check (data_confidence between 0 and 100),
  lookup_json jsonb not null default '{}'::jsonb,
  user_verified_count integer not null default 0,
  disputed_count integer not null default 0,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table nutrition_global_product_catalog enable row level security;

drop policy if exists nutrition_global_product_catalog_read_authenticated on nutrition_global_product_catalog;
create policy nutrition_global_product_catalog_read_authenticated
on nutrition_global_product_catalog for select
using (auth.role() = 'authenticated');

-- Writes are intentionally server-side only through the service role/admin client.
create unique index if not exists nutrition_global_product_catalog_gtin_uq on nutrition_global_product_catalog(gtin) where gtin is not null;
create unique index if not exists nutrition_global_product_catalog_barcode_uq on nutrition_global_product_catalog(barcode) where barcode is not null;
create index if not exists nutrition_global_product_catalog_product_idx on nutrition_global_product_catalog using gin (to_tsvector('english', coalesce(product_name,'') || ' ' || coalesce(brand_name,'')));
create index if not exists nutrition_global_product_catalog_brand_idx on nutrition_global_product_catalog(brand_name);
create index if not exists nutrition_global_product_catalog_seen_idx on nutrition_global_product_catalog(last_seen_at desc);

create table if not exists app_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, bucket, window_start)
);

alter table app_rate_limits enable row level security;
-- No authenticated-user policies. This table is written via the service role or SECURITY DEFINER RPC only.

create or replace function consume_app_rate_limit(
  p_user_id uuid,
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
)
returns table(allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz;
  v_count integer;
begin
  if p_user_id is null or p_bucket is null or length(trim(p_bucket)) = 0 then
    raise exception 'Invalid rate-limit input';
  end if;

  v_window := to_timestamp(floor(extract(epoch from now()) / greatest(p_window_seconds, 60)) * greatest(p_window_seconds, 60));

  insert into app_rate_limits(user_id, bucket, window_start, count, updated_at)
  values (p_user_id, left(p_bucket, 80), v_window, 1, now())
  on conflict (user_id, bucket, window_start)
  do update set count = app_rate_limits.count + 1, updated_at = now()
  returning count into v_count;

  return query select
    v_count <= greatest(p_limit, 1) as allowed,
    greatest(greatest(p_limit, 1) - v_count, 0) as remaining,
    v_window + make_interval(secs => greatest(p_window_seconds, 60)) as reset_at;
end;
$$;

revoke all on function consume_app_rate_limit(uuid, text, integer, integer) from public;
grant execute on function consume_app_rate_limit(uuid, text, integer, integer) to service_role;
-- Service-role/admin calls can execute this. If you later want authenticated clients to call it,
-- wrap p_user_id with auth.uid() internally first; do not expose arbitrary p_user_id to clients.

create index if not exists app_rate_limits_cleanup_idx on app_rate_limits(window_start);

-- Guardrails for product confidence values on the private catalog.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'nutrition_product_catalog_confidence_check'
  ) then
    alter table nutrition_product_catalog
    add constraint nutrition_product_catalog_confidence_check
    check (data_confidence between 0 and 100);
  end if;
end $$;

notify pgrst, 'reload schema';
