-- LOOP v27.89 product image caching / quality admin RLS / affordability framework support
-- Safe to run after v27.88. Adds admin-save RPCs so product quality overrides no longer fail RLS.

create extension if not exists pgcrypto;


create or replace function public.loop_try_numeric(p_value text)
returns numeric
language plpgsql
immutable
as $$
begin
  if p_value is null or btrim(p_value) = '' then return null; end if;
  return regexp_replace(p_value, '[^0-9.\-]', '', 'g')::numeric;
exception when others then
  return null;
end;
$$;

create or replace function public.loop_try_timestamptz(p_value text)
returns timestamptz
language plpgsql
immutable
as $$
begin
  if p_value is null or btrim(p_value) = '' then return null; end if;
  return p_value::timestamptz;
exception when others then
  return null;
end;
$$;

-- Public bucket for app-owned product images imported from external URLs by admin actions.
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = true;

create table if not exists public.loop_product_quality_snapshots (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null unique,
  display_name text,
  brand_name text,
  product_type text,
  source_provider text,
  source_url text,
  main_image_url text,
  calories numeric,
  confidence integer,
  has_image boolean default false,
  has_nutrition boolean default false,
  has_verified_source boolean default false,
  quality_score integer default 0,
  missing_fields text[] default '{}',
  status text default 'needs_review',
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.loop_product_quality_snapshots
  add column if not exists item_kind text default 'product',
  add column if not exists source_image_url text,
  add column if not exists cached_main_image_url text,
  add column if not exists image_storage_path text,
  add column if not exists protein_g numeric,
  add column if not exists carbs_g numeric,
  add column if not exists fat_g numeric,
  add column if not exists fibre_g numeric,
  add column if not exists sugar_g numeric,
  add column if not exists salt_g numeric,
  add column if not exists micronutrients text,
  add column if not exists has_macros boolean default false,
  add column if not exists has_micros boolean default false,
  add column if not exists hidden_by_admin boolean default false,
  add column if not exists admin_note text;

create or replace function public.loop_v2789_is_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_result boolean := false;
begin
  if to_regprocedure('public.app_is_platform_admin()') is not null then
    execute 'select public.app_is_platform_admin()' into v_result;
    if coalesce(v_result, false) then return true; end if;
  end if;
  if to_regprocedure('public.loop_is_platform_admin()') is not null then
    execute 'select public.loop_is_platform_admin()' into v_result;
    if coalesce(v_result, false) then return true; end if;
  end if;
  if to_regclass('public.app_admin_users') is not null then
    execute 'select exists (
      select 1
      from public.app_admin_users a
      where a.status = ''active''
        and (a.user_id = auth.uid() or lower(coalesce(a.email, '''')) = lower(coalesce(auth.jwt() ->> ''email'', '''')))
    )' into v_result;
    if coalesce(v_result, false) then return true; end if;
  end if;
  return lower(coalesce(auth.jwt() ->> 'email','')) = 'dan@insideloop.life';
end;
$$;

grant execute on function public.loop_v2789_is_admin() to anon, authenticated;

create or replace function public.loop_admin_save_product_quality_snapshot(p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if not public.loop_v2789_is_admin() then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;

  insert into public.loop_product_quality_snapshots (
    card_id, item_kind, display_name, brand_name, product_type, source_provider,
    source_url, source_image_url, main_image_url, cached_main_image_url, image_storage_path,
    calories, protein_g, carbs_g, fat_g, fibre_g, sugar_g, salt_g, micronutrients,
    confidence, has_image, has_nutrition, has_verified_source, has_macros, has_micros,
    quality_score, missing_fields, status, hidden_by_admin, admin_note, last_checked_at, updated_at
  ) values (
    (p_payload ->> 'card_id')::uuid,
    coalesce(p_payload ->> 'item_kind', 'product'),
    p_payload ->> 'display_name',
    p_payload ->> 'brand_name',
    p_payload ->> 'product_type',
    p_payload ->> 'source_provider',
    p_payload ->> 'source_url',
    p_payload ->> 'source_image_url',
    p_payload ->> 'main_image_url',
    p_payload ->> 'cached_main_image_url',
    p_payload ->> 'image_storage_path',
    nullif(p_payload ->> 'calories','')::numeric,
    nullif(p_payload ->> 'protein_g','')::numeric,
    nullif(p_payload ->> 'carbs_g','')::numeric,
    nullif(p_payload ->> 'fat_g','')::numeric,
    nullif(p_payload ->> 'fibre_g','')::numeric,
    nullif(p_payload ->> 'sugar_g','')::numeric,
    nullif(p_payload ->> 'salt_g','')::numeric,
    p_payload ->> 'micronutrients',
    coalesce(nullif(p_payload ->> 'confidence','')::integer, 0),
    coalesce((p_payload ->> 'has_image')::boolean, false),
    coalesce((p_payload ->> 'has_nutrition')::boolean, false),
    coalesce((p_payload ->> 'has_verified_source')::boolean, false),
    coalesce((p_payload ->> 'has_macros')::boolean, false),
    coalesce((p_payload ->> 'has_micros')::boolean, false),
    coalesce(nullif(p_payload ->> 'quality_score','')::integer, 0),
    coalesce(ARRAY(select jsonb_array_elements_text(coalesce(p_payload -> 'missing_fields','[]'::jsonb))), '{}'::text[]),
    coalesce(p_payload ->> 'status', 'needs_review'),
    coalesce((p_payload ->> 'hidden_by_admin')::boolean, false),
    p_payload ->> 'admin_note',
    coalesce(nullif(p_payload ->> 'last_checked_at','')::timestamptz, now()),
    now()
  )
  on conflict (card_id) do update set
    item_kind = excluded.item_kind,
    display_name = excluded.display_name,
    brand_name = excluded.brand_name,
    product_type = excluded.product_type,
    source_provider = excluded.source_provider,
    source_url = excluded.source_url,
    source_image_url = coalesce(excluded.source_image_url, public.loop_product_quality_snapshots.source_image_url),
    main_image_url = excluded.main_image_url,
    cached_main_image_url = coalesce(excluded.cached_main_image_url, public.loop_product_quality_snapshots.cached_main_image_url),
    image_storage_path = coalesce(excluded.image_storage_path, public.loop_product_quality_snapshots.image_storage_path),
    calories = excluded.calories,
    protein_g = excluded.protein_g,
    carbs_g = excluded.carbs_g,
    fat_g = excluded.fat_g,
    fibre_g = excluded.fibre_g,
    sugar_g = excluded.sugar_g,
    salt_g = excluded.salt_g,
    micronutrients = excluded.micronutrients,
    confidence = excluded.confidence,
    has_image = excluded.has_image,
    has_nutrition = excluded.has_nutrition,
    has_verified_source = excluded.has_verified_source,
    has_macros = excluded.has_macros,
    has_micros = excluded.has_micros,
    quality_score = excluded.quality_score,
    missing_fields = excluded.missing_fields,
    status = excluded.status,
    hidden_by_admin = false,
    admin_note = excluded.admin_note,
    last_checked_at = excluded.last_checked_at,
    updated_at = now();
end;
$$;

grant execute on function public.loop_admin_save_product_quality_snapshot(jsonb) to authenticated;

create or replace function public.loop_admin_archive_product_quality_item(p_card_id uuid, p_display_name text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if not public.loop_v2789_is_admin() then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;

  insert into public.loop_product_quality_snapshots(card_id, display_name, status, hidden_by_admin, updated_at, last_checked_at)
  values (p_card_id, coalesce(p_display_name, 'Archived product'), 'archived', true, now(), now())
  on conflict (card_id) do update set status = 'archived', hidden_by_admin = true, updated_at = now();
end;
$$;

grant execute on function public.loop_admin_archive_product_quality_item(uuid,text) to authenticated;

drop function if exists public.loop_admin_products_list(integer);

create or replace function public.loop_admin_products_list(p_limit integer default 5000)
returns table (
  product_id uuid,
  item_kind text,
  display_name text,
  brand_name text,
  product_type text,
  source_provider text,
  source_url text,
  source_image_url text,
  main_image_url text,
  cached_main_image_url text,
  calories numeric,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  fibre_g numeric,
  sugar_g numeric,
  salt_g numeric,
  micronutrients text,
  confidence integer,
  has_image boolean,
  has_nutrition boolean,
  has_verified_source boolean,
  has_macros boolean,
  has_micros boolean,
  quality_score integer,
  missing_fields text[],
  status text,
  hidden_by_admin boolean,
  admin_note text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 5000), 10000));
  v_union text := '';
  v_sql text;
begin
  if to_regclass('public.loop_nutrition_cards') is not null then
    v_union := v_union || case when v_union = '' then '' else ' union all ' end || $part$
      select
        c.id::uuid as product_id,
        case
          when lower(coalesce(j ->> 'card_kind', j ->> 'source_type', j ->> 'product_type', j ->> 'category', '')) like '%recipe%' then 'recipe'
          when lower(coalesce(j ->> 'card_kind', j ->> 'source_type', j ->> 'product_type', j ->> 'category', '')) like '%ingredient%' then 'ingredient'
          when lower(coalesce(j ->> 'card_kind', j ->> 'source_type', j ->> 'product_type', j ->> 'category', '')) like '%meal%' then 'meal_card'
          else 'product'
        end::text as item_kind,
        coalesce(j ->> 'display_name', j ->> 'name', j ->> 'title', j ->> 'product_name', j ->> 'formal_name', 'Unnamed product')::text as display_name,
        coalesce(j ->> 'brand_name', j ->> 'brand', j ->> 'vendor', j ->> 'retailer_name')::text as brand_name,
        coalesce(j ->> 'product_type', j ->> 'card_kind', j ->> 'category', j ->> 'category_path')::text as product_type,
        coalesce(j ->> 'source_provider', j ->> 'source_kind', j ->> 'retailer_name', j ->> 'shop_tag')::text as source_provider,
        coalesce(j ->> 'source_url', j ->> 'url', j ->> 'product_url')::text as source_url,
        coalesce(j ->> 'source_image_url', j ->> 'external_image_url')::text as source_image_url,
        coalesce(j ->> 'main_image_url', j ->> 'image_url', j ->> 'image', j ->> 'thumbnail_url')::text as main_image_url,
        coalesce(j ->> 'cached_main_image_url', j ->> 'local_image_url')::text as cached_main_image_url,
        coalesce(public.loop_try_numeric(j ->> 'calories'), public.loop_try_numeric(j #>> '{nutrition,calories}'), public.loop_try_numeric(j #>> '{nutrition,kcal}'), public.loop_try_numeric(j ->> 'energy_kcal'))::numeric as calories,
        coalesce(public.loop_try_numeric(j ->> 'protein_g'), public.loop_try_numeric(j ->> 'protein'), public.loop_try_numeric(j #>> '{nutrition,protein}'))::numeric as protein_g,
        coalesce(public.loop_try_numeric(j ->> 'carbs_g'), public.loop_try_numeric(j ->> 'carbohydrate'), public.loop_try_numeric(j #>> '{nutrition,carbs}'))::numeric as carbs_g,
        coalesce(public.loop_try_numeric(j ->> 'fat_g'), public.loop_try_numeric(j ->> 'fat'), public.loop_try_numeric(j #>> '{nutrition,fat}'))::numeric as fat_g,
        coalesce(public.loop_try_numeric(j ->> 'fibre_g'), public.loop_try_numeric(j ->> 'fiber'), public.loop_try_numeric(j #>> '{nutrition,fibre}'))::numeric as fibre_g,
        coalesce(public.loop_try_numeric(j ->> 'sugar_g'), public.loop_try_numeric(j ->> 'sugar'), public.loop_try_numeric(j #>> '{nutrition,sugar}'))::numeric as sugar_g,
        coalesce(public.loop_try_numeric(j ->> 'salt_g'), public.loop_try_numeric(j ->> 'salt'), public.loop_try_numeric(j #>> '{nutrition,salt}'))::numeric as salt_g,
        coalesce(j ->> 'micronutrients', j ->> 'ingredients', j ->> 'ingredient_text', j #>> '{nutrition,micronutrients}')::text as micronutrients,
        coalesce(public.loop_try_numeric(j ->> 'confidence'), public.loop_try_numeric(j ->> 'estimate_confidence'), public.loop_try_numeric(j ->> 'source_confidence'))::integer as confidence,
        coalesce(j ->> 'status', j ->> 'data_quality_status', 'active')::text as source_status,
        coalesce(public.loop_try_timestamptz(j ->> 'updated_at'), public.loop_try_timestamptz(j ->> 'created_at'), now()) as source_updated_at
      from (select t.id, to_jsonb(t.*) as j from public.loop_nutrition_cards t) c
    $part$;
  end if;

  if to_regclass('public.nutrition_ingredients') is not null then
    v_union := v_union || case when v_union = '' then '' else ' union all ' end || $part$
      select
        i.id::uuid as product_id,
        'ingredient'::text as item_kind,
        coalesce(j ->> 'label', j ->> 'display_name', j ->> 'name', 'Unnamed product')::text as display_name,
        coalesce(j ->> 'brand_name', j ->> 'brand')::text as brand_name,
        coalesce(j ->> 'source_type', 'ingredient')::text as product_type,
        coalesce(j ->> 'source_type', j ->> 'source_provider', 'ingredient')::text as source_provider,
        coalesce(j ->> 'source_url', j ->> 'url')::text as source_url,
        coalesce(j ->> 'source_image_url', j ->> 'external_image_url')::text as source_image_url,
        coalesce(j ->> 'image_url', j ->> 'main_image_url')::text as main_image_url,
        coalesce(j ->> 'cached_main_image_url', j ->> 'local_image_url')::text as cached_main_image_url,
        coalesce(public.loop_try_numeric(j ->> 'calories'), public.loop_try_numeric(j ->> 'kcal'), public.loop_try_numeric(j #>> '{nutrition,calories}'))::numeric as calories,
        coalesce(public.loop_try_numeric(j ->> 'protein_g'), public.loop_try_numeric(j ->> 'protein'))::numeric as protein_g,
        coalesce(public.loop_try_numeric(j ->> 'carbs_g'), public.loop_try_numeric(j ->> 'carbohydrate'))::numeric as carbs_g,
        coalesce(public.loop_try_numeric(j ->> 'fat_g'), public.loop_try_numeric(j ->> 'fat'))::numeric as fat_g,
        coalesce(public.loop_try_numeric(j ->> 'fibre_g'), public.loop_try_numeric(j ->> 'fiber'))::numeric as fibre_g,
        coalesce(public.loop_try_numeric(j ->> 'sugar_g'), public.loop_try_numeric(j ->> 'sugar'))::numeric as sugar_g,
        coalesce(public.loop_try_numeric(j ->> 'salt_g'), public.loop_try_numeric(j ->> 'salt'))::numeric as salt_g,
        coalesce(j ->> 'micronutrients', j ->> 'ingredient_text', j ->> 'notes')::text as micronutrients,
        coalesce(public.loop_try_numeric(j ->> 'data_confidence'), public.loop_try_numeric(j ->> 'confidence'))::integer as confidence,
        'active'::text as source_status,
        coalesce(public.loop_try_timestamptz(j ->> 'last_used_at'), public.loop_try_timestamptz(j ->> 'updated_at'), public.loop_try_timestamptz(j ->> 'created_at'), now()) as source_updated_at
      from (select t.id, to_jsonb(t.*) as j from public.nutrition_ingredients t) i
    $part$;
  end if;

  if v_union = '' then
    return;
  end if;

  v_sql := format($sql$
    with mapped as (%s), joined as (
      select
        m.product_id,
        coalesce(q.item_kind, m.item_kind)::text as item_kind,
        coalesce(q.display_name, m.display_name)::text as display_name,
        coalesce(q.brand_name, m.brand_name)::text as brand_name,
        coalesce(q.product_type, m.product_type)::text as product_type,
        coalesce(q.source_provider, m.source_provider)::text as source_provider,
        coalesce(q.source_url, m.source_url)::text as source_url,
        coalesce(q.source_image_url, m.source_image_url)::text as source_image_url,
        coalesce(q.cached_main_image_url, q.main_image_url, m.cached_main_image_url, m.main_image_url)::text as main_image_url,
        coalesce(q.cached_main_image_url, m.cached_main_image_url)::text as cached_main_image_url,
        coalesce(q.calories, m.calories)::numeric as calories,
        coalesce(q.protein_g, m.protein_g)::numeric as protein_g,
        coalesce(q.carbs_g, m.carbs_g)::numeric as carbs_g,
        coalesce(q.fat_g, m.fat_g)::numeric as fat_g,
        coalesce(q.fibre_g, m.fibre_g)::numeric as fibre_g,
        coalesce(q.sugar_g, m.sugar_g)::numeric as sugar_g,
        coalesce(q.salt_g, m.salt_g)::numeric as salt_g,
        coalesce(q.micronutrients, m.micronutrients)::text as micronutrients,
        coalesce(q.confidence, m.confidence, 0)::integer as confidence,
        q.has_image as q_has_image,
        q.has_nutrition as q_has_nutrition,
        q.has_verified_source as q_has_verified_source,
        q.has_macros as q_has_macros,
        q.has_micros as q_has_micros,
        q.quality_score as q_quality_score,
        q.missing_fields as q_missing_fields,
        coalesce(q.status, m.source_status, 'needs_review')::text as status,
        coalesce(q.hidden_by_admin, false)::boolean as hidden_by_admin,
        q.admin_note,
        coalesce(q.updated_at, q.last_checked_at, m.source_updated_at, now()) as updated_at
      from mapped m
      left join public.loop_product_quality_snapshots q on q.card_id = m.product_id
    ), scored as (
      select *,
        (protein_g is not null and carbs_g is not null and fat_g is not null and (fibre_g is not null or sugar_g is not null or salt_g is not null)) as derived_macros,
        (nullif(micronutrients, '') is not null) as derived_micros
      from joined
    )
    select
      j.product_id,
      j.item_kind,
      j.display_name,
      j.brand_name,
      j.product_type,
      j.source_provider,
      j.source_url,
      j.source_image_url,
      j.main_image_url,
      j.cached_main_image_url,
      j.calories,
      j.protein_g,
      j.carbs_g,
      j.fat_g,
      j.fibre_g,
      j.sugar_g,
      j.salt_g,
      j.micronutrients,
      j.confidence,
      coalesce(j.q_has_image, nullif(j.main_image_url, '') is not null) as has_image,
      coalesce(j.q_has_nutrition, j.calories is not null) as has_nutrition,
      coalesce(j.q_has_verified_source, nullif(j.source_url, '') is not null or nullif(j.source_provider, '') is not null) as has_verified_source,
      coalesce(j.q_has_macros, j.derived_macros) as has_macros,
      coalesce(j.q_has_micros, j.derived_micros) as has_micros,
      coalesce(j.q_quality_score,
        (case when nullif(j.main_image_url, '') is not null then 15 else 0 end
        + case when j.calories is not null then 25 else 0 end
        + case when j.derived_macros then 15 else 0 end
        + case when j.derived_micros then 10 else 0 end
        + case when nullif(j.source_url, '') is not null or nullif(j.source_provider, '') is not null then 20 else 0 end
        + case when coalesce(j.confidence, 0) >= 70 then 15 else 0 end)::integer
      ) as quality_score,
      coalesce(j.q_missing_fields, array_remove(array[
        case when nullif(j.main_image_url, '') is null then 'image' end,
        case when j.calories is null then 'nutrition' end,
        case when not j.derived_macros then 'macro_nutrients' end,
        case when not j.derived_micros then 'micro_nutrients' end,
        case when not (nullif(j.source_url, '') is not null or nullif(j.source_provider, '') is not null) then 'verified_source' end,
        case when coalesce(j.confidence, 0) < 70 then 'confidence' end
      ], null)::text[]) as missing_fields,
      j.status,
      j.hidden_by_admin,
      j.admin_note,
      j.updated_at
    from scored j
    where coalesce(j.hidden_by_admin, false) = false
      and coalesce(j.status, '') <> 'archived'
    order by quality_score asc, updated_at desc
    limit %s
  $sql$, v_union, v_limit);

  return query execute v_sql;
end;
$$;

grant execute on function public.loop_admin_products_list(integer) to anon, authenticated;

-- Product quality edits are admin-only through RPC/action. Keep direct table writes closed to normal users.
alter table public.loop_product_quality_snapshots enable row level security;

drop policy if exists loop_product_quality_snapshots_admin_all on public.loop_product_quality_snapshots;
create policy loop_product_quality_snapshots_admin_all on public.loop_product_quality_snapshots
for all to authenticated
using (public.loop_v2789_is_admin())
with check (public.loop_v2789_is_admin());
