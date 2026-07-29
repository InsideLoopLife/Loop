-- LOOP v27.81 Admin live UI + user foundation repair
--
-- This is the missing layer after v27.79/v27.80:
-- - creates/backfills app_user_profiles from auth.users
-- - creates/backfills app_notification_preferences from auth.users
-- - upgrades loop_admin_users_list() so admin can see auth users even when no profile exists
-- - keeps live dashboard snapshot available
--
-- Run in Supabase:
--   db/v27_81_admin_live_ui_user_foundation.sql
--
-- Then check:
--   select * from public.loop_v2781_admin_live_ui_healthcheck();
--   select public.loop_admin_backfill_user_foundation();
--   select public.loop_admin_dashboard_snapshot();
--   select * from public.loop_admin_users_list(50);

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
-- Admin identity
-- ---------------------------------------------------------------------------

create table if not exists public.app_admin_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  email text not null,
  role text not null default 'admin',
  status text not null default 'active',
  notes text,
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

alter table public.app_admin_users drop constraint if exists app_admin_users_role_check;
alter table public.app_admin_users add constraint app_admin_users_role_check
check (role in ('owner','admin','super_admin','developer','support','viewer'));

alter table public.app_admin_users drop constraint if exists app_admin_users_status_check;
alter table public.app_admin_users add constraint app_admin_users_status_check
check (status in ('active','invited','disabled','removed'));

create unique index if not exists app_admin_users_email_lower_idx
on public.app_admin_users (lower(email));

do $$
begin
  if exists (select 1 from public.app_admin_users where lower(email) = 'dan@insideloop.life') then
    update public.app_admin_users
    set role = 'owner',
        status = 'active',
        notes = coalesce(notes, 'Seeded owner fallback from v27.81 admin live UI repair.'),
        updated_at = now()
    where lower(email) = 'dan@insideloop.life';
  else
    insert into public.app_admin_users (email, role, status, notes)
    values ('dan@insideloop.life', 'owner', 'active', 'Seeded owner fallback from v27.81 admin live UI repair.');
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
-- App user foundation tables
-- ---------------------------------------------------------------------------

create table if not exists public.app_households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Household',
  created_by uuid references auth.users(id) on delete set null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  household_id uuid references public.app_households(id) on delete set null,
  display_name text,
  email text,
  timezone text not null default 'Europe/London',
  currency text not null default 'GBP',
  payment_tier text not null default 'free',
  payment_tier_status text not null default 'inactive',
  payment_tier_override text,
  billing_provider text not null default 'manual',
  billing_customer_id text,
  billing_subscription_id text,
  market_data_tier text not null default 'manual',
  market_data_tier_override text,
  market_data_provider_status text not null default 'not_configured',
  market_data_realtime_enabled boolean not null default false,
  tier_checked_at timestamptz,
  tier_check_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_user_profiles
  add column if not exists household_id uuid,
  add column if not exists display_name text,
  add column if not exists email text,
  add column if not exists timezone text not null default 'Europe/London',
  add column if not exists currency text not null default 'GBP',
  add column if not exists payment_tier text not null default 'free',
  add column if not exists payment_tier_status text not null default 'inactive',
  add column if not exists payment_tier_override text,
  add column if not exists billing_provider text not null default 'manual',
  add column if not exists billing_customer_id text,
  add column if not exists billing_subscription_id text,
  add column if not exists market_data_tier text not null default 'manual',
  add column if not exists market_data_tier_override text,
  add column if not exists market_data_provider_status text not null default 'not_configured',
  add column if not exists market_data_realtime_enabled boolean not null default false,
  add column if not exists tier_checked_at timestamptz,
  add column if not exists tier_check_note text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.app_user_profiles drop constraint if exists app_user_profiles_payment_tier_check;
alter table public.app_user_profiles add constraint app_user_profiles_payment_tier_check
check (payment_tier in ('free','starter','plus','pro','realtime','enterprise'));

alter table public.app_user_profiles drop constraint if exists app_user_profiles_payment_tier_status_check;
alter table public.app_user_profiles add constraint app_user_profiles_payment_tier_status_check
check (payment_tier_status in ('active','trialing','manual_review','past_due','cancelled','inactive'));

alter table public.app_user_profiles drop constraint if exists app_user_profiles_market_data_tier_check;
alter table public.app_user_profiles add constraint app_user_profiles_market_data_tier_check
check (market_data_tier in ('manual','delayed','enhanced_delayed','realtime'));

create unique index if not exists app_user_profiles_user_id_idx
on public.app_user_profiles (user_id);

create table if not exists public.app_household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.app_households(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text not null default 'member',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_household_members_user_idx on public.app_household_members(user_id, status);

create table if not exists public.app_notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid references public.app_households(id) on delete set null,
  finance_digest_enabled boolean not null default true,
  health_digest_enabled boolean not null default true,
  lifestyle_digest_enabled boolean not null default true,
  renewal_reminders_enabled boolean not null default true,
  weekly_email_enabled boolean not null default true,
  monthly_email_enabled boolean not null default true,
  in_app_enabled boolean not null default true,
  push_notifications_enabled boolean not null default false,
  preferred_send_day text not null default 'Monday',
  preferred_send_time time not null default '08:00',
  quiet_hours_start time default '21:00',
  quiet_hours_end time default '07:00',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_notification_preferences
  add column if not exists lifestyle_digest_enabled boolean not null default true,
  add column if not exists in_app_enabled boolean not null default true,
  add column if not exists finance_digest_enabled boolean not null default true,
  add column if not exists health_digest_enabled boolean not null default true,
  add column if not exists push_notifications_enabled boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists app_notification_preferences_user_idx
on public.app_notification_preferences (user_id);

-- ---------------------------------------------------------------------------
-- Admin sections / tabs
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
('users','Users','Auth users, app profiles, households, permissions and notification preferences.','/admin/users','core','users',true,true,20,'users'),
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
-- Backfill user foundation
-- ---------------------------------------------------------------------------

create or replace function public.loop_admin_backfill_user_foundation()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_profiles_before integer := 0;
  v_profiles_after integer := 0;
  v_prefs_before integer := 0;
  v_prefs_after integer := 0;
begin
  select count(*)::integer into v_profiles_before from public.app_user_profiles;
  select count(*)::integer into v_prefs_before from public.app_notification_preferences;

  insert into public.app_user_profiles (
    user_id,
    email,
    display_name,
    timezone,
    currency,
    payment_tier,
    payment_tier_status,
    billing_provider,
    market_data_tier,
    market_data_provider_status,
    market_data_realtime_enabled,
    tier_checked_at,
    tier_check_note,
    created_at,
    updated_at
  )
  select
    u.id,
    u.email,
    coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', split_part(u.email, '@', 1)),
    'Europe/London',
    'GBP',
    'free',
    'inactive',
    'manual',
    'manual',
    'not_configured',
    false,
    now(),
    'Backfilled from auth.users by admin foundation repair.',
    coalesce(u.created_at, now()),
    now()
  from auth.users u
  where u.email is not null
  on conflict (user_id) do update
  set email = coalesce(public.app_user_profiles.email, excluded.email),
      display_name = coalesce(public.app_user_profiles.display_name, excluded.display_name),
      updated_at = now();

  insert into public.app_notification_preferences (
    user_id,
    finance_digest_enabled,
    health_digest_enabled,
    lifestyle_digest_enabled,
    in_app_enabled,
    push_notifications_enabled,
    created_at,
    updated_at
  )
  select
    u.id,
    true,
    true,
    true,
    true,
    false,
    now(),
    now()
  from auth.users u
  where u.email is not null
  on conflict (user_id) do update
  set updated_at = now();

  select count(*)::integer into v_profiles_after from public.app_user_profiles;
  select count(*)::integer into v_prefs_after from public.app_notification_preferences;

  return jsonb_build_object(
    'ok', true,
    'profiles_before', v_profiles_before,
    'profiles_after', v_profiles_after,
    'profiles_created', greatest(0, v_profiles_after - v_profiles_before),
    'preferences_before', v_prefs_before,
    'preferences_after', v_prefs_after,
    'preferences_created', greatest(0, v_prefs_after - v_prefs_before),
    'auth_users', (select count(*)::integer from auth.users)
  );
end;
$$;

grant execute on function public.loop_admin_backfill_user_foundation() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Live users list, extended for admin page
-- ---------------------------------------------------------------------------

drop function if exists public.loop_admin_users_list(integer);

create or replace function public.loop_admin_users_list(p_limit integer default 100)
returns table (
  user_id uuid,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  admin_role text,
  admin_status text,
  profile_status text,
  household_count integer,
  display_name text,
  payment_tier text,
  payment_tier_status text,
  market_data_tier text,
  market_data_realtime_enabled boolean,
  in_app_enabled boolean,
  wealth_digest_enabled boolean,
  lifestyle_digest_enabled boolean,
  profile_updated_at timestamptz
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
    case when p.user_id is not null then 'profile linked' else 'profile missing' end::text,
    coalesce(h.household_count, 0)::integer,
    p.display_name,
    coalesce(p.payment_tier, 'free')::text,
    coalesce(p.payment_tier_status, 'inactive')::text,
    coalesce(p.market_data_tier, 'manual')::text,
    coalesce(p.market_data_realtime_enabled, false),
    coalesce(pref.in_app_enabled, false),
    coalesce(pref.finance_digest_enabled, false),
    coalesce(pref.lifestyle_digest_enabled, pref.health_digest_enabled, false),
    p.updated_at
  from auth.users u
  left join public.app_admin_users au on lower(au.email) = lower(u.email)
  left join public.app_user_profiles p on p.user_id = u.id
  left join public.app_notification_preferences pref on pref.user_id = u.id
  left join (
    select user_id, count(*)::integer as household_count
    from public.app_household_members
    where status = 'active'
    group by user_id
  ) h on h.user_id = u.id
  order by u.created_at desc
  limit v_limit;
end;
$$;

grant execute on function public.loop_admin_users_list(integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Dashboard snapshot, now based on auth users and foundation tables
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
  v_household_members integer := 0;
  v_products integer := 0;
  v_product_quality integer := 0;
  v_product_imports integer := 0;
  v_alerts integer := 0;
  v_open_issues integer := 0;
  v_money_deals integer := 0;
  v_properties integer := 0;
  v_vehicles integer := 0;
  v_in_app_enabled integer := 0;
  v_wealth_digest_enabled integer := 0;
  v_lifestyle_digest_enabled integer := 0;
  v_paid_or_overridden integer := 0;
  v_realtime_enabled integer := 0;
  v_sections jsonb := '[]'::jsonb;
  v_db jsonb := '{}'::jsonb;
begin
  begin
    select count(*)::integer into v_auth_users from auth.users;
  exception when others then
    v_auth_users := 0;
  end;

  v_admin_users := public.loop_safe_table_count('public.app_admin_users');
  v_profiles := public.loop_safe_table_count('public.app_user_profiles');
  v_households := public.loop_safe_table_count('public.app_households');
  v_household_members := public.loop_safe_table_count('public.app_household_members');
  v_product_quality := public.loop_safe_table_count('public.loop_product_quality_snapshots');

  if to_regclass('public.loop_nutrition_cards') is not null then
    execute 'select count(*)::integer from public.loop_nutrition_cards' into v_products;
  elsif to_regclass('public.app_products') is not null then
    execute 'select count(*)::integer from public.app_products' into v_products;
  end if;

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

  select count(*)::integer into v_in_app_enabled from public.app_notification_preferences where in_app_enabled = true;
  select count(*)::integer into v_wealth_digest_enabled from public.app_notification_preferences where finance_digest_enabled = true;
  select count(*)::integer into v_lifestyle_digest_enabled from public.app_notification_preferences where coalesce(lifestyle_digest_enabled, health_digest_enabled) = true;

  select count(*)::integer into v_paid_or_overridden
  from public.app_user_profiles
  where coalesce(payment_tier_override, payment_tier, 'free') in ('starter','plus','pro','realtime','enterprise')
     or payment_tier_status in ('active','trialing','manual_review');

  select count(*)::integer into v_realtime_enabled
  from public.app_user_profiles
  where market_data_realtime_enabled = true
     or coalesce(market_data_tier_override, market_data_tier) = 'realtime';

  select coalesce(jsonb_agg(to_jsonb(s) order by s.sort_order), '[]'::jsonb)
  into v_sections
  from public.loop_admin_sections s
  where s.enabled = true;

  v_db := jsonb_build_object(
    'auth_users', true,
    'app_user_profiles', to_regclass('public.app_user_profiles') is not null,
    'app_households', to_regclass('public.app_households') is not null,
    'app_household_members', to_regclass('public.app_household_members') is not null,
    'app_notification_preferences', to_regclass('public.app_notification_preferences') is not null,
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
      'household_members', v_household_members,
      'products', v_products,
      'product_quality_rows', v_product_quality,
      'product_import_batches', v_product_imports,
      'open_alerts', v_alerts,
      'open_user_issues', v_open_issues,
      'money_deals', v_money_deals,
      'properties', v_properties,
      'vehicles', v_vehicles,
      'in_app_enabled', v_in_app_enabled,
      'wealth_digest_enabled', v_wealth_digest_enabled,
      'lifestyle_digest_enabled', v_lifestyle_digest_enabled,
      'paid_or_overridden_users', v_paid_or_overridden,
      'realtime_enabled_users', v_realtime_enabled
    ),
    'sections', v_sections,
    'database', v_db,
    'admin_message',
      case
        when v_auth_users > v_profiles then 'Auth users exist without app profiles. Run user foundation backfill.'
        when v_auth_users > 0 and v_profiles >= v_auth_users then 'Admin is using live auth users and app profiles.'
        else 'No auth users found or auth.users is not readable.'
      end
  );
end;
$$;

grant execute on function public.loop_admin_dashboard_snapshot() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Navigation
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
-- RLS, lenient owner/admin policies for foundation tables
-- ---------------------------------------------------------------------------

alter table public.app_user_profiles enable row level security;
alter table public.app_notification_preferences enable row level security;
alter table public.app_admin_users enable row level security;

create or replace function public.app_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select public.loop_is_platform_admin();
$$;

grant execute on function public.app_is_admin() to anon, authenticated;

drop policy if exists app_user_profiles_own_or_admin on public.app_user_profiles;
create policy app_user_profiles_own_or_admin on public.app_user_profiles
for all to authenticated
using (user_id = auth.uid() or public.loop_is_platform_admin())
with check (user_id = auth.uid() or public.loop_is_platform_admin());

drop policy if exists app_notification_preferences_own_or_admin on public.app_notification_preferences;
create policy app_notification_preferences_own_or_admin on public.app_notification_preferences
for all to authenticated
using (user_id = auth.uid() or public.loop_is_platform_admin())
with check (user_id = auth.uid() or public.loop_is_platform_admin());

drop policy if exists app_admin_users_admin on public.app_admin_users;
create policy app_admin_users_admin on public.app_admin_users
for all to authenticated
using (public.loop_is_platform_admin())
with check (public.loop_is_platform_admin());

-- ---------------------------------------------------------------------------
-- Healthcheck
-- ---------------------------------------------------------------------------

create or replace function public.loop_v2781_admin_live_ui_healthcheck()
returns table(section text, check_name text, ok boolean, detail text)
language sql
security definer
set search_path = public, auth, pg_catalog
as $$
  select 'admin','owner row',
    exists(select 1 from public.app_admin_users where lower(email) = 'dan@insideloop.life' and status = 'active' and role in ('owner','admin','super_admin')),
    'dan@insideloop.life is active owner/admin.'
  union all
  select 'users','auth users readable',
    (select count(*) >= 0 from auth.users),
    'Admin RPC can read auth.users.'
  union all
  select 'users','app_user_profiles exists',
    to_regclass('public.app_user_profiles') is not null,
    'App profile table exists.'
  union all
  select 'users','profile rows not above auth users',
    (select count(*) from public.app_user_profiles) <= (select count(*) from auth.users),
    'Profile row count is sane relative to auth users.'
  union all
  select 'users','notification preferences exists',
    to_regclass('public.app_notification_preferences') is not null,
    'Notification preference table exists.'
  union all
  select 'admin','dashboard snapshot RPC',
    exists(select 1 from pg_proc where proname = 'loop_admin_dashboard_snapshot'),
    'Admin dashboard snapshot function exists.'
  union all
  select 'admin','users list RPC',
    exists(select 1 from pg_proc where proname = 'loop_admin_users_list'),
    'Admin users list function exists.'
  union all
  select 'admin','backfill RPC',
    exists(select 1 from pg_proc where proname = 'loop_admin_backfill_user_foundation'),
    'Backfill user foundation function exists.'
  union all
  select 'admin','products tab',
    exists(select 1 from public.loop_admin_sections where section_key = 'products' and enabled = true),
    'Products is own admin section.'
$$;

grant execute on function public.loop_v2781_admin_live_ui_healthcheck() to anon, authenticated;

notify pgrst, 'reload schema';
