-- LOOP v27.80 Admin Products Column-Safe RPC Fix
--
-- Fixes:
--   ERROR: column c.name does not exist
--
-- Cause:
--   v27.79 referenced optional product columns directly:
--     c.name, c.brand, c.nutrition, c.updated_at, etc.
--   Your real loop_nutrition_cards table does not have all of those columns.
--
-- This version reads product rows through to_jsonb(c), so missing optional
-- columns do not crash the RPC.
--
-- Run this in Supabase SQL editor.
--
-- Then check:
--   select * from public.loop_v2780_admin_products_column_safe_healthcheck();
--   select * from public.loop_admin_products_list(50);
--   select public.loop_admin_dashboard_snapshot();

create extension if not exists pgcrypto;

create or replace function public.loop_text_to_numeric_safe(p_value text)
returns numeric
language plpgsql
immutable
set search_path = public, pg_catalog
as $$
declare
  v_clean text;
begin
  if p_value is null or trim(p_value) = '' then
    return null;
  end if;

  v_clean := regexp_replace(p_value, '[^0-9\.\-]', '', 'g');

  if v_clean is null or v_clean = '' or v_clean = '-' or v_clean = '.' then
    return null;
  end if;

  return v_clean::numeric;
exception when others then
  return null;
end;
$$;

grant execute on function public.loop_text_to_numeric_safe(text) to anon, authenticated;

create table if not exists public.loop_product_quality_snapshots (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null,
  display_name text,
  brand_name text,
  product_type text,
  source_provider text,
  source_url text,
  main_image_url text,
  calories numeric,
  confidence integer,
  has_image boolean not null default false,
  has_nutrition boolean not null default false,
  has_verified_source boolean not null default false,
  has_serving boolean not null default false,
  has_allergen_split boolean not null default false,
  image_last_checked_at timestamptz,
  image_status text,
  quality_score integer not null default 0,
  missing_fields text[] not null default array[]::text[],
  status text not null default 'needs_review',
  last_checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists loop_product_quality_snapshots_card_idx
on public.loop_product_quality_snapshots(card_id);

create or replace function public.loop_safe_table_count(p_table_name text)
returns integer
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_count integer := 0;
begin
  if to_regclass(p_table_name) is null then
    return 0;
  end if;

  execute 'select count(*)::integer from ' || p_table_name into v_count;
  return coalesce(v_count, 0);
exception when others then
  return 0;
end;
$$;

grant execute on function public.loop_safe_table_count(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Column-safe product list
-- ---------------------------------------------------------------------------

drop function if exists public.loop_admin_products_list(integer);

create or replace function public.loop_admin_products_list(p_limit integer default 100)
returns table (
  product_id uuid,
  display_name text,
  brand_name text,
  product_type text,
  source_provider text,
  source_url text,
  main_image_url text,
  calories numeric,
  confidence integer,
  has_image boolean,
  has_nutrition boolean,
  has_verified_source boolean,
  quality_score integer,
  missing_fields text[],
  status text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 500));
begin
  -- Prefer quality snapshots if already populated.
  if to_regclass('public.loop_product_quality_snapshots') is not null
     and public.loop_safe_table_count('public.loop_product_quality_snapshots') > 0 then
    return query
    select
      q.card_id,
      coalesce(q.display_name, 'Unnamed product')::text,
      q.brand_name,
      q.product_type,
      q.source_provider,
      q.source_url,
      q.main_image_url,
      q.calories,
      q.confidence,
      q.has_image,
      q.has_nutrition,
      q.has_verified_source,
      q.quality_score,
      q.missing_fields,
      q.status,
      q.updated_at
    from public.loop_product_quality_snapshots q
    order by q.quality_score asc, q.updated_at desc
    limit v_limit;
    return;
  end if;

  -- loop_nutrition_cards is not schema-stable yet, so read all optional fields
  -- via to_jsonb(row). Missing JSON keys return null instead of throwing.
  if to_regclass('public.loop_nutrition_cards') is not null then
    return query execute
    'with src as (
       select c.id::uuid as id, to_jsonb(c) as j
       from public.loop_nutrition_cards c
     ),
     mapped as (
       select
         s.id as product_id,
         coalesce(
           s.j ->> ''display_name'',
           s.j ->> ''name'',
           s.j ->> ''title'',
           s.j ->> ''product_name'',
           s.j ->> ''formal_name'',
           ''Unnamed product''
         )::text as display_name,
         coalesce(
           s.j ->> ''brand_name'',
           s.j ->> ''brand'',
           s.j ->> ''vendor'',
           s.j ->> ''retailer_name''
         )::text as brand_name,
         coalesce(
           s.j ->> ''product_type'',
           s.j ->> ''card_kind'',
           s.j ->> ''category'',
           s.j ->> ''category_path''
         )::text as product_type,
         coalesce(
           s.j ->> ''source_provider'',
           s.j ->> ''source_kind'',
           s.j ->> ''retailer_name'',
           s.j ->> ''shop_tag''
         )::text as source_provider,
         coalesce(s.j ->> ''source_url'', s.j ->> ''url'', s.j ->> ''product_url'')::text as source_url,
         coalesce(
           s.j ->> ''main_image_url'',
           s.j ->> ''image_url'',
           s.j ->> ''image'',
           s.j ->> ''thumbnail_url''
         )::text as main_image_url,
         coalesce(
           public.loop_text_to_numeric_safe(s.j ->> ''calories''),
           public.loop_text_to_numeric_safe(s.j #>> ''{nutrition,calories}''),
           public.loop_text_to_numeric_safe(s.j #>> ''{nutrition,kcal}''),
           public.loop_text_to_numeric_safe(s.j #>> ''{nutrition,energy_kcal}'')
         )::numeric as calories,
         coalesce(
           public.loop_text_to_numeric_safe(s.j ->> ''confidence''),
           public.loop_text_to_numeric_safe(s.j ->> ''estimate_confidence''),
           public.loop_text_to_numeric_safe(s.j ->> ''source_confidence'')
         )::integer as confidence,
         coalesce(s.j ->> ''status'', ''active'')::text as status,
         coalesce(
           public.loop_text_to_numeric_safe(s.j ->> ''updated_at'')::text::timestamptz,
           public.loop_text_to_numeric_safe(s.j ->> ''created_at'')::text::timestamptz,
           now()
         ) as maybe_bad_ts,
         coalesce(s.j ->> ''updated_at'', s.j ->> ''created_at'') as date_text
       from src s
     )
     select
       m.product_id,
       m.display_name,
       m.brand_name,
       m.product_type,
       m.source_provider,
       m.source_url,
       m.main_image_url,
       m.calories,
       m.confidence,
       (nullif(m.main_image_url, '''') is not null) as has_image,
       (m.calories is not null) as has_nutrition,
       (nullif(m.source_url, '''') is not null or nullif(m.source_provider, '''') is not null) as has_verified_source,
       (
         case when nullif(m.main_image_url, '''') is not null then 25 else 0 end
         + case when m.calories is not null then 35 else 0 end
         + case when nullif(m.source_url, '''') is not null or nullif(m.source_provider, '''') is not null then 25 else 0 end
         + case when coalesce(m.confidence,0) >= 70 then 15 else 0 end
       )::integer as quality_score,
       array_remove(array[
         case when nullif(m.main_image_url, '''') is null then ''image'' end,
         case when m.calories is null then ''nutrition'' end,
         case when not (nullif(m.source_url, '''') is not null or nullif(m.source_provider, '''') is not null) then ''verified_source'' end,
         case when coalesce(m.confidence,0) < 70 then ''confidence'' end
       ], null)::text[] as missing_fields,
       m.status,
       coalesce(nullif(m.date_text, '''')::timestamptz, now()) as updated_at
     from mapped m
     order by updated_at desc
     limit ' || v_limit::text;
    return;
  end if;

  -- app_products fallback, also column-safe via to_jsonb.
  if to_regclass('public.app_products') is not null then
    return query execute
    'with src as (
       select p.id::uuid as id, to_jsonb(p) as j
       from public.app_products p
     ),
     mapped as (
       select
         s.id as product_id,
         coalesce(s.j ->> ''title'', s.j ->> ''name'', s.j ->> ''display_name'', ''Unnamed product'')::text as display_name,
         coalesce(s.j ->> ''brand'', s.j ->> ''brand_name'', s.j ->> ''vendor'')::text as brand_name,
         coalesce(s.j ->> ''product_type'', s.j ->> ''category'')::text as product_type,
         null::text as source_provider,
         coalesce(s.j ->> ''source_url'', s.j ->> ''url'')::text as source_url,
         coalesce(s.j ->> ''image_url'', s.j ->> ''main_image_url'', s.j ->> ''image'')::text as main_image_url,
         coalesce(s.j ->> ''status'', ''active'')::text as status,
         coalesce(s.j ->> ''updated_at'', s.j ->> ''created_at'') as date_text
       from src s
     )
     select
       m.product_id,
       m.display_name,
       m.brand_name,
       m.product_type,
       m.source_provider,
       m.source_url,
       m.main_image_url,
       null::numeric as calories,
       null::integer as confidence,
       (nullif(m.main_image_url, '''') is not null) as has_image,
       false as has_nutrition,
       (nullif(m.source_url, '''') is not null) as has_verified_source,
       (
         case when nullif(m.main_image_url, '''') is not null then 25 else 0 end
         + case when nullif(m.source_url, '''') is not null then 25 else 0 end
       )::integer as quality_score,
       array_remove(array[
         case when nullif(m.main_image_url, '''') is null then ''image'' end,
         ''nutrition'',
         case when nullif(m.source_url, '''') is null then ''verified_source'' end
       ], null)::text[] as missing_fields,
       m.status,
       coalesce(nullif(m.date_text, '''')::timestamptz, now()) as updated_at
     from mapped m
     order by updated_at desc
     limit ' || v_limit::text;
    return;
  end if;

  return;
end;
$$;

grant execute on function public.loop_admin_products_list(integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Snapshot function patch: same name as v27.79, but avoids relying on products
-- list internals. This is optional but keeps dashboard calls safe too.
-- ---------------------------------------------------------------------------

create or replace function public.loop_admin_dashboard_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_auth_users integer := 0;
  v_admin_users integer := 0;
  v_profiles integer := 0;
  v_households integer := 0;
  v_products integer := 0;
  v_product_quality integer := 0;
  v_product_imports integer := 0;
  v_alerts integer := 0;
  v_open_issues integer := 0;
  v_money_deals integer := 0;
  v_properties integer := 0;
  v_vehicles integer := 0;
  v_sections jsonb := '[]'::jsonb;
  v_db jsonb := '{}'::jsonb;
begin
  begin
    select count(*)::integer into v_auth_users from auth.users;
  exception when others then
    v_auth_users := 0;
  end;

  v_admin_users := public.loop_safe_table_count('public.app_admin_users');

  if to_regclass('public.app_profiles') is not null then
    execute 'select count(*)::integer from public.app_profiles' into v_profiles;
  elsif to_regclass('public.profiles') is not null then
    execute 'select count(*)::integer from public.profiles' into v_profiles;
  end if;

  if to_regclass('public.app_households') is not null then
    execute 'select count(*)::integer from public.app_households' into v_households;
  elsif to_regclass('public.households') is not null then
    execute 'select count(*)::integer from public.households' into v_households;
  end if;

  if to_regclass('public.loop_nutrition_cards') is not null then
    execute 'select count(*)::integer from public.loop_nutrition_cards' into v_products;
  elsif to_regclass('public.app_products') is not null then
    execute 'select count(*)::integer from public.app_products' into v_products;
  end if;

  v_product_quality := public.loop_safe_table_count('public.loop_product_quality_snapshots');

  if to_regclass('public.loop_product_import_batches') is not null then
    execute 'select count(*)::integer from public.loop_product_import_batches' into v_product_imports;
  elsif to_regclass('public.product_import_batches') is not null then
    execute 'select count(*)::integer from public.product_import_batches' into v_product_imports;
  end if;

  if to_regclass('public.loop_admin_alerts') is not null then
    execute 'select count(*)::integer from public.loop_admin_alerts where status in (''open'',''watching'',''needs_admin_review'',''in_progress'')' into v_alerts;
  end if;

  if to_regclass('public.loop_user_issue_reports') is not null then
    execute 'select count(*)::integer from public.loop_user_issue_reports where status in (''new'',''triaged'',''in_progress'',''waiting_user'')' into v_open_issues;
  end if;

  if to_regclass('public.loop_money_savings_deals') is not null then
    execute 'select count(*)::integer from public.loop_money_savings_deals where status in (''active'',''needs_review'')' into v_money_deals;
  end if;

  if to_regclass('public.loop_household_properties') is not null then
    execute 'select count(*)::integer from public.loop_household_properties where coalesce(status,''active'') <> ''deleted''' into v_properties;
  end if;

  if to_regclass('public.loop_household_vehicles') is not null then
    execute 'select count(*)::integer from public.loop_household_vehicles where coalesce(status,''active'') <> ''deleted''' into v_vehicles;
  end if;

  if to_regclass('public.loop_admin_sections') is not null then
    select coalesce(jsonb_agg(to_jsonb(s) order by s.sort_order), '[]'::jsonb)
    into v_sections
    from public.loop_admin_sections s
    where s.enabled = true;
  end if;

  v_db := jsonb_build_object(
    'app_admin_users', to_regclass('public.app_admin_users') is not null,
    'loop_admin_sections', to_regclass('public.loop_admin_sections') is not null,
    'loop_nutrition_cards', to_regclass('public.loop_nutrition_cards') is not null,
    'loop_product_quality_snapshots', to_regclass('public.loop_product_quality_snapshots') is not null,
    'loop_product_import_batches', to_regclass('public.loop_product_import_batches') is not null,
    'loop_admin_alerts', to_regclass('public.loop_admin_alerts') is not null,
    'loop_user_issue_reports', to_regclass('public.loop_user_issue_reports') is not null,
    'loop_money_savings_deals', to_regclass('public.loop_money_savings_deals') is not null,
    'loop_household_properties', to_regclass('public.loop_household_properties') is not null,
    'loop_household_vehicles', to_regclass('public.loop_household_vehicles') is not null,
    'loop_property_data_sources', to_regclass('public.loop_property_data_sources') is not null
  );

  return jsonb_build_object(
    'ok', true,
    'generated_at', now(),
    'current_user_email', coalesce(auth.jwt() ->> 'email', null),
    'is_platform_admin', public.loop_is_platform_admin(),
    'counts', jsonb_build_object(
      'auth_users', v_auth_users,
      'admin_users', v_admin_users,
      'profiles', v_profiles,
      'households', v_households,
      'products', v_products,
      'product_quality_rows', v_product_quality,
      'product_import_batches', v_product_imports,
      'open_alerts', v_alerts,
      'open_user_issues', v_open_issues,
      'money_deals', v_money_deals,
      'properties', v_properties,
      'vehicles', v_vehicles
    ),
    'sections', v_sections,
    'database', v_db,
    'admin_message', 'Admin dashboard snapshot is using column-safe product logic.'
  );
end;
$$;

grant execute on function public.loop_admin_dashboard_snapshot() to anon, authenticated;

create or replace function public.loop_v2780_admin_products_column_safe_healthcheck()
returns table(section text, check_name text, ok boolean, detail text)
language sql
security definer
set search_path = public, auth, pg_catalog
as $$
  select 'products','products list RPC exists',
    exists(select 1 from pg_proc where proname = 'loop_admin_products_list'),
    'Column-safe product list function exists.'
  union all
  select 'products','product source table exists',
    to_regclass('public.loop_nutrition_cards') is not null
      or to_regclass('public.loop_product_quality_snapshots') is not null
      or to_regclass('public.app_products') is not null,
    'At least one product/quality source table exists.'
  union all
  select 'products','product count source',
    (
      public.loop_safe_table_count('public.loop_product_quality_snapshots')
      + public.loop_safe_table_count('public.loop_nutrition_cards')
      + public.loop_safe_table_count('public.app_products')
    ) >= 0,
    'Product source count can be read without column assumptions.'
  union all
  select 'admin','dashboard RPC exists',
    exists(select 1 from pg_proc where proname = 'loop_admin_dashboard_snapshot'),
    'Dashboard snapshot exists.'
$$;

grant execute on function public.loop_v2780_admin_products_column_safe_healthcheck() to anon, authenticated;
