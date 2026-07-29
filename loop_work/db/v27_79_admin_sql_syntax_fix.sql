-- LOOP v27.79 Admin SQL syntax fix
--
-- Fixes v27.78 error:
--   ERROR: mismatched parentheses at or near ";"
--
-- This version removes the fragile dynamic FORMAT(...) RPCs and replaces them
-- with simpler defensive functions.
--
-- Run this in Supabase SQL editor:
--   db/v27_79_admin_sql_syntax_fix.sql
--
-- Then check:
--   select * from public.loop_v2779_admin_sql_syntax_healthcheck();
--   select public.loop_admin_dashboard_snapshot();
--   select * from public.loop_admin_users_list(50);
--   select * from public.loop_admin_products_list(50);
--   select * from public.loop_admin_product_imports_list(50);
--   select * from public.loop_admin_navigation();

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
-- Admin users
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
on public.app_admin_users (lower(email));

do $$
begin
  if exists (select 1 from public.app_admin_users where lower(email) = 'dan@insideloop.life') then
    update public.app_admin_users
    set role = 'owner',
        status = 'active',
        notes = coalesce(notes, 'Seeded owner fallback from v27.79 admin SQL syntax fix.'),
        updated_at = now()
    where lower(email) = 'dan@insideloop.life';
  else
    insert into public.app_admin_users (email, role, status, notes)
    values ('dan@insideloop.life', 'owner', 'active', 'Seeded owner fallback from v27.79 admin SQL syntax fix.');
  end if;
end $$;

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
-- Admin sections / products tab
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
-- Minimal tables if missing
-- ---------------------------------------------------------------------------

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

create table if not exists public.loop_admin_alerts (
  id uuid primary key default gen_random_uuid(),
  area text not null,
  sub_area text,
  alert_key text not null,
  title text not null,
  summary text,
  detail text,
  severity text not null default 'medium',
  status text not null default 'open',
  source_kind text not null default 'system',
  entity_kind text,
  entity_id text,
  action_url text,
  assigned_to uuid references auth.users(id) on delete set null,
  dedupe_key text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  next_check_at timestamptz,
  last_checked_at timestamptz,
  check_cadence_minutes integer not null default 1440,
  consecutive_failures integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists loop_admin_alerts_open_dedupe_idx
on public.loop_admin_alerts(dedupe_key)
where status in ('open','watching','needs_admin_review','in_progress');

create table if not exists public.loop_user_issue_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  household_id uuid,
  issue_area text not null,
  title text not null,
  description text not null,
  page_path text,
  browser text,
  device_label text,
  screenshot_url text,
  severity text not null default 'medium',
  status text not null default 'new',
  admin_notes text,
  linked_alert_id uuid references public.loop_admin_alerts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Safe count helper
-- ---------------------------------------------------------------------------

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
-- Users list
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
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 500));
begin
  return query
  select
    u.id,
    u.email::text,
    u.created_at,
    u.last_sign_in_at,
    au.role,
    au.status,
    case
      when to_regclass('public.app_profiles') is null then 'profile table missing'
      when exists (select 1 from public.app_profiles p where p.user_id = u.id) then 'profile linked'
      else 'no profile found'
    end::text,
    case
      when to_regclass('public.app_household_members') is null then 0
      else (
        select count(*)::integer
        from public.app_household_members hm
        where hm.user_id = u.id
      )
    end
  from auth.users u
  left join public.app_admin_users au on lower(au.email) = lower(u.email)
  order by u.created_at desc
  limit v_limit;
exception when undefined_table then
  return query
  select
    au.user_id,
    au.email,
    au.created_at,
    null::timestamptz,
    au.role,
    au.status,
    'auth.users or profile/member table not readable'::text,
    0::integer
  from public.app_admin_users au
  order by au.created_at desc
  limit v_limit;
end;
$$;

grant execute on function public.loop_admin_users_list(integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Product list
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
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 500));
begin
  if to_regclass('public.loop_product_quality_snapshots') is not null
     and public.loop_safe_table_count('public.loop_product_quality_snapshots') > 0 then
    return query
    select
      q.card_id,
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
    limit v_limit;
    return;
  end if;

  if to_regclass('public.loop_nutrition_cards') is not null then
    return query execute
    'select
      c.id::uuid as product_id,
      coalesce(c.display_name, c.name, ''Unnamed product'')::text as display_name,
      coalesce(c.brand_name, c.brand, null)::text as brand_name,
      coalesce(c.product_type, c.card_kind, null)::text as product_type,
      c.source_provider::text as source_provider,
      c.source_url::text as source_url,
      c.main_image_url::text as main_image_url,
      c.calories::numeric as calories,
      c.confidence::integer as confidence,
      (nullif(c.main_image_url,'''') is not null) as has_image,
      (c.calories is not null or coalesce(c.nutrition,''{}''::jsonb) <> ''{}''::jsonb) as has_nutrition,
      (nullif(c.source_url,'''') is not null or nullif(c.source_provider,'''') is not null) as has_verified_source,
      (
        case when nullif(c.main_image_url,'''') is not null then 25 else 0 end
        + case when c.calories is not null or coalesce(c.nutrition,''{}''::jsonb) <> ''{}''::jsonb then 35 else 0 end
        + case when nullif(c.source_url,'''') is not null or nullif(c.source_provider,'''') is not null then 25 else 0 end
        + case when coalesce(c.confidence,0) >= 70 then 15 else 0 end
      )::integer as quality_score,
      array_remove(array[
        case when nullif(c.main_image_url,'''') is null then ''image'' end,
        case when not (c.calories is not null or coalesce(c.nutrition,''{}''::jsonb) <> ''{}''::jsonb) then ''nutrition'' end,
        case when not (nullif(c.source_url,'''') is not null or nullif(c.source_provider,'''') is not null) then ''verified_source'' end,
        case when coalesce(c.confidence,0) < 70 then ''confidence'' end
      ], null)::text[] as missing_fields,
      coalesce(c.status,''active'')::text as status,
      coalesce(c.updated_at, c.created_at, now())::timestamptz as updated_at
    from public.loop_nutrition_cards c
    order by updated_at desc
    limit ' || v_limit::text;
    return;
  end if;

  if to_regclass('public.app_products') is not null then
    return query execute
    'select
      p.id::uuid as product_id,
      coalesce(p.title, p.name, ''Unnamed product'')::text as display_name,
      p.brand::text as brand_name,
      p.product_type::text as product_type,
      null::text as source_provider,
      null::text as source_url,
      p.image_url::text as main_image_url,
      null::numeric as calories,
      null::integer as confidence,
      (nullif(p.image_url,'''') is not null) as has_image,
      false as has_nutrition,
      false as has_verified_source,
      case when nullif(p.image_url,'''') is not null then 25 else 0 end as quality_score,
      array_remove(array[
        case when nullif(p.image_url,'''') is null then ''image'' end,
        ''nutrition'',
        ''verified_source''
      ], null)::text[] as missing_fields,
      coalesce(p.status,''active'')::text as status,
      coalesce(p.updated_at, p.created_at, now())::timestamptz as updated_at
    from public.app_products p
    order by updated_at desc
    limit ' || v_limit::text;
    return;
  end if;

  return;
end;
$$;

grant execute on function public.loop_admin_products_list(integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Imports list
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
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 500));
begin
  if to_regclass('public.loop_product_import_batches') is not null then
    return query execute
    'select
      b.id::uuid as batch_id,
      coalesce(b.source_name, b.file_name, b.source_type, ''Import'')::text as source_name,
      coalesce(b.status, ''unknown'')::text as status,
      coalesce(b.total_rows, 0)::integer as total_rows,
      coalesce(b.ready_rows, 0)::integer as ready_rows,
      coalesce(b.needs_review_rows, 0)::integer as needs_review_rows,
      coalesce(b.imported_rows, 0)::integer as imported_rows,
      coalesce(b.created_at, now())::timestamptz as created_at,
      coalesce(b.updated_at, b.created_at, now())::timestamptz as updated_at
    from public.loop_product_import_batches b
    order by coalesce(b.updated_at, b.created_at, now()) desc
    limit ' || v_limit::text;
    return;
  end if;

  if to_regclass('public.product_import_batches') is not null then
    return query execute
    'select
      b.id::uuid as batch_id,
      coalesce(b.source_name, b.file_name, ''Import'')::text as source_name,
      coalesce(b.status, ''unknown'')::text as status,
      coalesce(b.total_rows, 0)::integer as total_rows,
      0::integer as ready_rows,
      0::integer as needs_review_rows,
      0::integer as imported_rows,
      coalesce(b.created_at, now())::timestamptz as created_at,
      coalesce(b.updated_at, b.created_at, now())::timestamptz as updated_at
    from public.product_import_batches b
    order by coalesce(b.updated_at, b.created_at, now()) desc
    limit ' || v_limit::text;
    return;
  end if;

  return;
end;
$$;

grant execute on function public.loop_admin_product_imports_list(integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Nav
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

-- ---------------------------------------------------------------------------
-- Healthcheck
-- ---------------------------------------------------------------------------

create or replace function public.loop_v2779_admin_sql_syntax_healthcheck()
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
  select 'admin','products section enabled',
    exists(select 1 from public.loop_admin_sections where section_key = 'products' and enabled = true),
    'Products is available as its own admin tab/section.'
  union all
  select 'admin','dashboard snapshot RPC',
    exists(select 1 from pg_proc where proname = 'loop_admin_dashboard_snapshot'),
    'Admin dashboard can fetch live snapshot.'
  union all
  select 'users','users list RPC',
    exists(select 1 from pg_proc where proname = 'loop_admin_users_list'),
    'Admin can list users.'
  union all
  select 'products','products list RPC',
    exists(select 1 from pg_proc where proname = 'loop_admin_products_list'),
    'Admin can list products or product quality rows.'
  union all
  select 'imports','imports list RPC',
    exists(select 1 from pg_proc where proname = 'loop_admin_product_imports_list'),
    'Admin can list product import batches where table exists.'
  union all
  select 'nav','navigation RPC',
    exists(select 1 from pg_proc where proname = 'loop_admin_navigation'),
    'Admin navigation function exists.'
  union all
  select 'database','auth users readable',
    (select count(*) >= 0 from auth.users),
    'Security-definer functions can read auth.users.'
$$;

grant execute on function public.loop_v2779_admin_sql_syntax_healthcheck() to anon, authenticated;
