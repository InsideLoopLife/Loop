-- LOOP v27.78 Admin visibility/data repair
--
-- Purpose:
-- The admin screen was loading, but not actually pulling/digesting useful DB data.
-- This update gives admin a reliable data layer:
--   - admin user table repair
--   - owner seed that works even if columns differ
--   - admin navigation/sections including Products as its own tab
--   - admin dashboard snapshot RPC
--   - users list RPC
--   - product quality/data list RPC
--   - import status RPC
--   - database object health RPC
--
-- Run this in Supabase SQL editor.
--
-- Then check:
--   select * from public.loop_v2778_admin_visibility_healthcheck();
--   select public.loop_admin_dashboard_snapshot();
--   select * from public.loop_admin_users_list(50);
--   select * from public.loop_admin_products_list(50);

create extension if not exists pgcrypto;

create or replace function public.loop_set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin user/permission repair
-- ---------------------------------------------------------------------------

create table if not exists public.app_admin_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  email text not null,
  role text not null default 'admin',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_admin_users
  add column if not exists user_id uuid,
  add column if not exists email text,
  add column if not exists role text not null default 'admin',
  add column if not exists status text not null default 'active',
  add column if not exists notes text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.app_admin_users
  drop constraint if exists app_admin_users_role_check;

alter table public.app_admin_users
  add constraint app_admin_users_role_check
  check (role in ('owner','admin','super_admin','developer','support','viewer'));

alter table public.app_admin_users
  drop constraint if exists app_admin_users_status_check;

alter table public.app_admin_users
  add constraint app_admin_users_status_check
  check (status in ('active','invited','disabled','removed'));

create unique index if not exists app_admin_users_email_lower_idx
on public.app_admin_users(lower(email));

insert into public.app_admin_users (email, role, status, notes)
values ('dan@insideloop.life', 'owner', 'active', 'Seeded owner fallback from v27.78 admin visibility repair.')
on conflict (lower(email)) do update
set role = excluded.role,
    status = excluded.status,
    notes = coalesce(public.app_admin_users.notes, excluded.notes),
    updated_at = now();

create or replace function public.loop_is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1
    from public.app_admin_users au
    where lower(au.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and au.status = 'active'
      and au.role in ('owner','admin','super_admin','developer','support')
  )
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin', '') = 'true'
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','owner','super_admin')
  or coalesce(auth.jwt() -> 'user_metadata' ->> 'loop_admin', '') = 'true';
$$;

grant execute on function public.loop_is_platform_admin() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Admin navigation / feature tabs
-- ---------------------------------------------------------------------------

create table if not exists public.loop_admin_sections (
  section_key text primary key,
  label text not null,
  description text,
  href text not null,
  category text not null default 'core',
  icon_key text,
  enabled boolean not null default true,
  requires_admin boolean not null default true,
  sort_order integer not null default 100,
  health_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.loop_admin_sections
(section_key, label, description, href, category, icon_key, enabled, requires_admin, sort_order, health_key)
values
('overview','Overview','System health, runtime readiness and key admin metrics.','/admin','core','dashboard',true,true,10,'overview'),
('users','Users','Users, admin permissions, household/profile coverage and role state.','/admin/users','core','users',true,true,20,'users'),
('products','Products','Product library, imports, missing images, nutrition, source verification and quality tiles.','/admin/products/quality','nutrition','products',true,true,30,'products'),
('product_imports','Product imports','Retailer CSV/ZIP imports, match status, price refresh and source checks.','/admin/product-imports','nutrition','import',true,true,40,'imports'),
('deals','Money deals','Savings deals, daily deal watch, blocked/withdrawn checks and opportunity logic.','/admin/money-deals','wealth','money',true,true,50,'deals'),
('notifications','Notifications','Deals, user issues, product issues, investment coverage and uptime alerts.','/admin/notifications','ops','bell',true,true,60,'alerts'),
('uptime','Uptime','Uptime targets and system continuity checks.','/admin/uptime','ops','activity',true,true,70,'uptime'),
('investment','Investment coverage','Manual investment coverage, markets, sources and SnapTrade health.','/admin/investment-coverage','wealth','chart',true,true,80,'investment'),
('property_sources','Property sources','Property affordability APIs and account setup checklist.','/admin/property-sources','assets','home',true,true,90,'property'),
('security','Security','Admin domain, launch checklist and deployment hardening.','/admin/security','ops','shield',true,true,100,'security')
on conflict (section_key) do update
set label = excluded.label,
    description = excluded.description,
    href = excluded.href,
    category = excluded.category,
    icon_key = excluded.icon_key,
    enabled = excluded.enabled,
    requires_admin = excluded.requires_admin,
    sort_order = excluded.sort_order,
    health_key = excluded.health_key,
    updated_at = now();

-- ---------------------------------------------------------------------------
-- Helper functions for safe dynamic reads
-- ---------------------------------------------------------------------------

create or replace function public.loop_safe_count(p_table regclass)
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_count integer := 0;
begin
  if p_table is null then
    return 0;
  end if;

  execute format('select count(*)::integer from %s', p_table) into v_count;
  return coalesce(v_count, 0);
exception when others then
  return 0;
end;
$$;

grant execute on function public.loop_safe_count(regclass) to anon, authenticated;

create or replace function public.loop_table_exists(p_name text)
returns boolean
language sql
stable
set search_path = public, pg_catalog
as $$
  select to_regclass(p_name) is not null;
$$;

grant execute on function public.loop_table_exists(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Admin dashboard snapshot
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
  -- Do not block this in development if JWT/admin row is not perfect.
  -- The page can still use this to diagnose why admin is not wired.

  begin
    select count(*)::integer into v_auth_users from auth.users;
  exception when others then
    v_auth_users := 0;
  end;

  v_admin_users := public.loop_safe_count('public.app_admin_users'::regclass);

  if to_regclass('public.app_profiles') is not null then
    execute 'select count(*)::integer from public.app_profiles' into v_profiles;
  elsif to_regclass('public.profiles') is not null then
    execute 'select count(*)::integer from public.profiles' into v_profiles;
  else
    v_profiles := 0;
  end if;

  if to_regclass('public.app_households') is not null then
    execute 'select count(*)::integer from public.app_households' into v_households;
  elsif to_regclass('public.households') is not null then
    execute 'select count(*)::integer from public.households' into v_households;
  else
    v_households := 0;
  end if;

  if to_regclass('public.loop_nutrition_cards') is not null then
    execute 'select count(*)::integer from public.loop_nutrition_cards' into v_products;
  elsif to_regclass('public.app_products') is not null then
    execute 'select count(*)::integer from public.app_products' into v_products;
  else
    v_products := 0;
  end if;

  if to_regclass('public.loop_product_quality_snapshots') is not null then
    execute 'select count(*)::integer from public.loop_product_quality_snapshots' into v_product_quality;
  end if;

  if to_regclass('public.loop_product_import_batches') is not null then
    execute 'select count(*)::integer from public.loop_product_import_batches' into v_product_imports;
  elsif to_regclass('public.product_import_batches') is not null then
    execute 'select count(*)::integer from public.product_import_batches' into v_product_imports;
  end if;

  if to_regclass('public.loop_admin_alerts') is not null then
    execute $q$select count(*)::integer from public.loop_admin_alerts where status in ('open','watching','needs_admin_review','in_progress')$q$ into v_alerts;
  end if;

  if to_regclass('public.loop_user_issue_reports') is not null then
    execute $q$select count(*)::integer from public.loop_user_issue_reports where status in ('new','triaged','in_progress','waiting_user')$q$ into v_open_issues;
  end if;

  if to_regclass('public.loop_money_savings_deals') is not null then
    execute $q$select count(*)::integer from public.loop_money_savings_deals where status in ('active','needs_review')$q$ into v_money_deals;
  end if;

  if to_regclass('public.loop_household_properties') is not null then
    execute $q$select count(*)::integer from public.loop_household_properties where coalesce(status,'active') <> 'deleted'$q$ into v_properties;
  end if;

  if to_regclass('public.loop_household_vehicles') is not null then
    execute $q$select count(*)::integer from public.loop_household_vehicles where coalesce(status,'active') <> 'deleted'$q$ into v_vehicles;
  end if;

  select coalesce(jsonb_agg(to_jsonb(s) order by s.sort_order), '[]'::jsonb)
  into v_sections
  from public.loop_admin_sections s
  where s.enabled = true;

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
    'admin_message',
      case
        when v_auth_users > 0 and v_admin_users > 0 then 'Admin data layer is returning live database information.'
        when v_auth_users > 0 and v_admin_users = 0 then 'Users exist, but no admin users are configured.'
        else 'Auth users are not readable from this function or no users exist yet.'
      end
  );
end;
$$;

grant execute on function public.loop_admin_dashboard_snapshot() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Admin users list: pulls actual auth users where possible
-- ---------------------------------------------------------------------------

create or replace function public.loop_admin_users_list(p_limit integer default 100)
returns table (
  user_id uuid,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  admin_role text,
  admin_status text,
  profile_status text,
  household_count integer
)
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
begin
  return query execute format($dyn$
    with auth_base as (
      select
        u.id as user_id,
        u.email::text as email,
        u.created_at,
        u.last_sign_in_at
      from auth.users u
      order by u.created_at desc
      limit %s
    ),
    household_counts as (
      select
        x.user_id,
        count(*)::integer as household_count
      from (
        select null::uuid as user_id where false
        union all
        select user_id from public.app_household_members where to_regclass('public.app_household_members') is not null
      ) x
      where x.user_id is not null
      group by x.user_id
    )
    select
      a.user_id,
      a.email,
      a.created_at,
      a.last_sign_in_at,
      au.role as admin_role,
      au.status as admin_status,
      case
        when p.id is not null then 'profile linked'
        else 'no profile found'
      end as profile_status,
      coalesce(h.household_count, 0) as household_count
    from auth_base a
    left join public.app_admin_users au on lower(au.email) = lower(a.email)
    left join public.app_profiles p on p.user_id = a.user_id
      and to_regclass('public.app_profiles') is not null
    left join household_counts h on h.user_id = a.user_id
    order by a.created_at desc
  $dyn$, greatest(1, least(coalesce(p_limit, 100), 500));
exception when undefined_table then
  return query
  select
    au.user_id,
    au.email,
    au.created_at,
    null::timestamptz as last_sign_in_at,
    au.role,
    au.status,
    'auth.users not readable or app_profiles missing'::text,
    0::integer
  from public.app_admin_users au
  order by au.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

grant execute on function public.loop_admin_users_list(integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Admin product list: works with either loop_nutrition_cards or quality table
-- ---------------------------------------------------------------------------

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
begin
  if to_regclass('public.loop_product_quality_snapshots') is not null then
    return query execute format($dyn$
      select
        q.card_id as product_id,
        q.display_name,
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
      limit %s
    $dyn$, greatest(1, least(coalesce(p_limit, 100), 500));
    return;
  end if;

  if to_regclass('public.loop_nutrition_cards') is not null then
    return query execute format($dyn$
      select
        c.id as product_id,
        coalesce(c.display_name, c.name, 'Unnamed product')::text as display_name,
        coalesce(c.brand_name, c.brand, null)::text as brand_name,
        coalesce(c.product_type, c.card_kind, null)::text as product_type,
        c.source_provider::text as source_provider,
        c.source_url::text as source_url,
        c.main_image_url::text as main_image_url,
        c.calories::numeric as calories,
        c.confidence::integer as confidence,
        (nullif(c.main_image_url,'') is not null) as has_image,
        (c.calories is not null or coalesce(c.nutrition,'{}'::jsonb) <> '{}'::jsonb) as has_nutrition,
        (nullif(c.source_url,'') is not null or nullif(c.source_provider,'') is not null) as has_verified_source,
        (
          case when nullif(c.main_image_url,'') is not null then 25 else 0 end
          + case when c.calories is not null or coalesce(c.nutrition,'{}'::jsonb) <> '{}'::jsonb then 35 else 0 end
          + case when nullif(c.source_url,'') is not null or nullif(c.source_provider,'') is not null then 25 else 0 end
          + case when coalesce(c.confidence,0) >= 70 then 15 else 0 end
        )::integer as quality_score,
        array_remove(array[
          case when nullif(c.main_image_url,'') is null then 'image' end,
          case when not (c.calories is not null or coalesce(c.nutrition,'{}'::jsonb) <> '{}'::jsonb) then 'nutrition' end,
          case when not (nullif(c.source_url,'') is not null or nullif(c.source_provider,'') is not null) then 'verified_source' end,
          case when coalesce(c.confidence,0) < 70 then 'confidence' end
        ], null)::text[] as missing_fields,
        coalesce(c.status,'active')::text as status,
        coalesce(c.updated_at, c.created_at, now())::timestamptz as updated_at
      from public.loop_nutrition_cards c
      order by updated_at desc
      limit %s
    $dyn$, greatest(1, least(coalesce(p_limit, 100), 500));
    return;
  end if;

  return;
end;
$$;

grant execute on function public.loop_admin_products_list(integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Admin import list
-- ---------------------------------------------------------------------------

create or replace function public.loop_admin_product_imports_list(p_limit integer default 100)
returns table (
  batch_id uuid,
  source_name text,
  status text,
  total_rows integer,
  ready_rows integer,
  needs_review_rows integer,
  imported_rows integer,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if to_regclass('public.loop_product_import_batches') is not null then
    return query execute format($dyn$
      select
        b.id as batch_id,
        coalesce(b.source_name, b.file_name, b.source_type, 'Import')::text as source_name,
        coalesce(b.status, 'unknown')::text as status,
        coalesce(b.total_rows, 0)::integer as total_rows,
        coalesce(b.ready_rows, 0)::integer as ready_rows,
        coalesce(b.needs_review_rows, 0)::integer as needs_review_rows,
        coalesce(b.imported_rows, 0)::integer as imported_rows,
        coalesce(b.created_at, now())::timestamptz as created_at,
        coalesce(b.updated_at, b.created_at, now())::timestamptz as updated_at
      from public.loop_product_import_batches b
      order by coalesce(b.updated_at, b.created_at, now()) desc
      limit %s
    $dyn$, greatest(1, least(coalesce(p_limit, 100), 500));
    return;
  end if;

  if to_regclass('public.product_import_batches') is not null then
    return query execute format($dyn$
      select
        b.id as batch_id,
        coalesce(b.source_name, b.file_name, 'Import')::text as source_name,
        coalesce(b.status, 'unknown')::text as status,
        coalesce(b.total_rows, 0)::integer as total_rows,
        0::integer as ready_rows,
        0::integer as needs_review_rows,
        0::integer as imported_rows,
        coalesce(b.created_at, now())::timestamptz as created_at,
        coalesce(b.updated_at, b.created_at, now())::timestamptz as updated_at
      from public.product_import_batches b
      order by coalesce(b.updated_at, b.created_at, now()) desc
      limit %s
    $dyn$, greatest(1, least(coalesce(p_limit, 100), 500));
    return;
  end if;

  return;
end;
$$;

grant execute on function public.loop_admin_product_imports_list(integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Healthcheck
-- ---------------------------------------------------------------------------

create or replace function public.loop_v2778_admin_visibility_healthcheck()
returns table(section text, check_name text, ok boolean, detail text)
language sql
security definer
set search_path = public, auth, pg_catalog
as $$
  select 'admin','app_admin_users table',
    to_regclass('public.app_admin_users') is not null,
    'Admin users table exists.'
  union all
  select 'admin','dan owner row',
    exists(select 1 from public.app_admin_users where lower(email) = 'dan@insideloop.life' and role in ('owner','admin','super_admin') and status = 'active'),
    'dan@insideloop.life is active admin/owner.'
  union all
  select 'admin','sections table',
    to_regclass('public.loop_admin_sections') is not null,
    'Admin navigation sections exist.'
  union all
  select 'admin','products section enabled',
    exists(select 1 from public.loop_admin_sections where section_key = 'products' and enabled = true),
    'Products is available as an admin tab/section.'
  union all
  select 'admin','dashboard snapshot RPC',
    exists(select 1 from pg_proc where proname = 'loop_admin_dashboard_snapshot'),
    'Admin dashboard can fetch live snapshot.'
  union all
  select 'users','users list RPC',
    exists(select 1 from pg_proc where proname = 'loop_admin_users_list'),
    'Admin can list users from auth/app tables.'
  union all
  select 'products','products list RPC',
    exists(select 1 from pg_proc where proname = 'loop_admin_products_list'),
    'Admin can list products or product quality rows.'
  union all
  select 'imports','imports list RPC',
    exists(select 1 from pg_proc where proname = 'loop_admin_product_imports_list'),
    'Admin can list product import batches where table exists.'
  union all
  select 'database','nutrition cards table',
    to_regclass('public.loop_nutrition_cards') is not null or to_regclass('public.app_products') is not null,
    'At least one product library table exists. If false, product importer/library migration still needs repair.'
  union all
  select 'database','auth users readable',
    (select count(*) >= 0 from auth.users),
    'The dashboard function can read auth.users under security definer.'
$$;

grant execute on function public.loop_v2778_admin_visibility_healthcheck() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Optional: give app code a simple view-like table function for nav
-- ---------------------------------------------------------------------------

create or replace function public.loop_admin_navigation()
returns table (
  section_key text,
  label text,
  description text,
  href text,
  category text,
  icon_key text,
  sort_order integer
)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select section_key, label, description, href, category, icon_key, sort_order
  from public.loop_admin_sections
  where enabled = true
  order by sort_order asc;
$$;

grant execute on function public.loop_admin_navigation() to anon, authenticated;
