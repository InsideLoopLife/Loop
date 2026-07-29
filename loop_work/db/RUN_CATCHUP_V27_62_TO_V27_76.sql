-- LOOP v27.76 full codebase: catch-up SQL bundle
-- Run individual files in order if this combined file is too large for Supabase SQL editor.


-- ============================================================
-- db/v27_62_plan_admin_control_fix.sql
-- ============================================================

-- v27.62 Inside LOOP plan/admin control fix
--
-- Fixes:
-- - Better tier pricing and comparison table data
-- - Admin plan-change notifications during beta
-- - Admin user list reads auth.users directly and backfills plan memberships
-- - Admin controls for AI limits, stock pairing, market data and feature health
-- - Investment chart behaviour settings by tier
--
-- Safe to run after v27.61.

create extension if not exists pgcrypto;

create or replace function public.app_set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------- admin helper with no hard public.profiles dependency ----------
create or replace function public.app_is_platform_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_jwt_role text := lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', ''));
  v_jwt_loop_admin text := lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin', ''));
  v_jwt_admin text := lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'admin', ''));
  v_is_admin boolean := false;
  v_has_profiles boolean := false;
  v_has_people boolean := false;
begin
  if v_user_id is null then
    return false;
  end if;

  if v_jwt_role in ('owner', 'admin', 'super_admin') then return true; end if;
  if v_jwt_loop_admin in ('true', '1', 'yes') then return true; end if;
  if v_jwt_admin in ('true', '1', 'yes') then return true; end if;

  select to_regclass('public.profiles') is not null into v_has_profiles;
  if v_has_profiles then
    execute
      'select exists (
        select 1 from public.profiles
        where id = $1 and lower(coalesce(role, '''')) in (''owner'', ''admin'', ''super_admin'')
      )'
      into v_is_admin
      using v_user_id;
    if coalesce(v_is_admin, false) then return true; end if;
  end if;

  select to_regclass('public.people') is not null into v_has_people;
  if v_has_people then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'people' and column_name = 'user_id'
    ) and exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'people' and column_name = 'role'
    ) then
      execute
        'select exists (
          select 1 from public.people
          where user_id = $1 and lower(coalesce(role, '''')) in (''owner'', ''admin'', ''super_admin'')
        )'
        into v_is_admin
        using v_user_id;
      if coalesce(v_is_admin, false) then return true; end if;
    end if;
  end if;

  return false;
end;
$$;

grant execute on function public.app_is_platform_admin() to anon;
grant execute on function public.app_is_platform_admin() to authenticated;

-- ---------- core tier tables ----------
create table if not exists public.app_tier_plans (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  is_active boolean not null default true,
  visible_to_users boolean not null default true,
  is_paid boolean not null default false,
  payment_required boolean not null default false,
  monthly_price_pence integer not null default 0,
  annual_price_pence integer not null default 0,
  currency text not null default 'GBP',
  sort_order integer not null default 100,
  badge text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_tier_plans_slug_check check (slug ~ '^[a-z0-9_\-]+$')
);

create table if not exists public.app_tier_features (
  feature_key text primary key,
  category text not null default 'General',
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_tier_features_key_check check (feature_key ~ '^[a-z0-9_\-]+$')
);

create table if not exists public.app_tier_plan_features (
  id uuid primary key default gen_random_uuid(),
  plan_slug text not null references public.app_tier_plans(slug) on delete cascade,
  feature_key text not null references public.app_tier_features(feature_key) on delete cascade,
  enabled boolean not null default false,
  limit_value numeric,
  limit_period text not null default 'none',
  enforcement_mode text not null default 'audit',
  health_status text not null default 'active',
  admin_note text,
  user_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_slug, feature_key),
  constraint app_tier_plan_features_period_check check (limit_period in ('none','day','week','month','year')),
  constraint app_tier_plan_features_enforcement_check check (enforcement_mode in ('audit','warn','block','upgrade')),
  constraint app_tier_plan_features_health_check check (health_status in ('active','degraded','disabled','hidden'))
);

create table if not exists public.app_user_plan_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_slug text not null references public.app_tier_plans(slug),
  status text not null default 'active',
  source text not null default 'default',
  manual_override boolean not null default false,
  override_reason text,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id),
  constraint app_user_plan_memberships_status_check check (status in ('active','trialing','pending','past_due','cancelled','expired')),
  constraint app_user_plan_memberships_source_check check (source in ('default','admin','beta','staff','promo','stripe','apple','google','test_request'))
);

create table if not exists public.app_plan_change_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  requested_plan_slug text not null references public.app_tier_plans(slug),
  current_plan_slug text,
  status text not null default 'requested',
  note text,
  created_at timestamptz not null default now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  constraint app_plan_change_requests_status_check check (status in ('requested','approved','rejected','cancelled'))
);

create table if not exists public.app_feature_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  household_id uuid,
  feature_key text not null,
  plan_slug text,
  quantity numeric not null default 1,
  allowed boolean not null default true,
  audit_only boolean not null default true,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.app_admin_notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'system',
  title text not null,
  body text,
  actor_user_id uuid references auth.users(id) on delete set null,
  target_admin_user_id uuid references auth.users(id) on delete set null,
  related_table text,
  related_id uuid,
  status text not null default 'unread',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint app_admin_notifications_status_check check (status in ('unread','read','archived'))
);

create table if not exists public.app_user_investment_chart_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  hide_legacy_charts_when_paired boolean not null default true,
  restore_legacy_charts_on_downgrade boolean not null default true,
  chart_pairing_mode text not null default 'auto',
  updated_at timestamptz not null default now(),
  constraint app_user_investment_chart_preferences_pairing_check check (chart_pairing_mode in ('auto','manual','legacy_only','paired_only'))
);

drop trigger if exists app_tier_plans_updated_at on public.app_tier_plans;
create trigger app_tier_plans_updated_at before update on public.app_tier_plans for each row execute function public.app_set_updated_at();

drop trigger if exists app_tier_features_updated_at on public.app_tier_features;
create trigger app_tier_features_updated_at before update on public.app_tier_features for each row execute function public.app_set_updated_at();

drop trigger if exists app_tier_plan_features_updated_at on public.app_tier_plan_features;
create trigger app_tier_plan_features_updated_at before update on public.app_tier_plan_features for each row execute function public.app_set_updated_at();

drop trigger if exists app_user_plan_memberships_updated_at on public.app_user_plan_memberships;
create trigger app_user_plan_memberships_updated_at before update on public.app_user_plan_memberships for each row execute function public.app_set_updated_at();

drop trigger if exists app_user_investment_chart_preferences_updated_at on public.app_user_investment_chart_preferences;
create trigger app_user_investment_chart_preferences_updated_at before update on public.app_user_investment_chart_preferences for each row execute function public.app_set_updated_at();

-- ---------- RLS ----------
alter table public.app_tier_plans enable row level security;
alter table public.app_tier_features enable row level security;
alter table public.app_tier_plan_features enable row level security;
alter table public.app_user_plan_memberships enable row level security;
alter table public.app_plan_change_requests enable row level security;
alter table public.app_feature_usage_events enable row level security;
alter table public.app_admin_notifications enable row level security;
alter table public.app_user_investment_chart_preferences enable row level security;

drop policy if exists "plans visible to users" on public.app_tier_plans;
create policy "plans visible to users" on public.app_tier_plans
for select to authenticated
using (is_active = true and visible_to_users = true);

drop policy if exists "plans admin all" on public.app_tier_plans;
create policy "plans admin all" on public.app_tier_plans
for all to authenticated
using (public.app_is_platform_admin())
with check (public.app_is_platform_admin());

drop policy if exists "features visible to users" on public.app_tier_features;
create policy "features visible to users" on public.app_tier_features
for select to authenticated
using (is_active = true);

drop policy if exists "features admin all" on public.app_tier_features;
create policy "features admin all" on public.app_tier_features
for all to authenticated
using (public.app_is_platform_admin())
with check (public.app_is_platform_admin());

drop policy if exists "plan features visible to users" on public.app_tier_plan_features;
create policy "plan features visible to users" on public.app_tier_plan_features
for select to authenticated
using (
  exists (
    select 1 from public.app_tier_plans p
    where p.slug = app_tier_plan_features.plan_slug
      and p.is_active = true
      and p.visible_to_users = true
  )
);

drop policy if exists "plan features admin all" on public.app_tier_plan_features;
create policy "plan features admin all" on public.app_tier_plan_features
for all to authenticated
using (public.app_is_platform_admin())
with check (public.app_is_platform_admin());

drop policy if exists "user plan self select" on public.app_user_plan_memberships;
create policy "user plan self select" on public.app_user_plan_memberships
for select to authenticated
using (user_id = auth.uid() or public.app_is_platform_admin());

drop policy if exists "user plan admin all" on public.app_user_plan_memberships;
create policy "user plan admin all" on public.app_user_plan_memberships
for all to authenticated
using (public.app_is_platform_admin())
with check (public.app_is_platform_admin());

drop policy if exists "plan requests self create" on public.app_plan_change_requests;
create policy "plan requests self create" on public.app_plan_change_requests
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "plan requests self select" on public.app_plan_change_requests;
create policy "plan requests self select" on public.app_plan_change_requests
for select to authenticated
using (user_id = auth.uid() or public.app_is_platform_admin());

drop policy if exists "plan requests admin update" on public.app_plan_change_requests;
create policy "plan requests admin update" on public.app_plan_change_requests
for update to authenticated
using (public.app_is_platform_admin())
with check (public.app_is_platform_admin());

drop policy if exists "usage self select" on public.app_feature_usage_events;
create policy "usage self select" on public.app_feature_usage_events
for select to authenticated
using (user_id = auth.uid() or public.app_is_platform_admin());

drop policy if exists "usage self insert" on public.app_feature_usage_events;
create policy "usage self insert" on public.app_feature_usage_events
for insert to authenticated
with check (user_id = auth.uid() or public.app_is_platform_admin());

drop policy if exists "admin notifications admin all" on public.app_admin_notifications;
create policy "admin notifications admin all" on public.app_admin_notifications
for all to authenticated
using (public.app_is_platform_admin())
with check (public.app_is_platform_admin());

drop policy if exists "chart preferences self all" on public.app_user_investment_chart_preferences;
create policy "chart preferences self all" on public.app_user_investment_chart_preferences
for all to authenticated
using (user_id = auth.uid() or public.app_is_platform_admin())
with check (user_id = auth.uid() or public.app_is_platform_admin());

-- ---------- Seed tier plans/pricing ----------
insert into public.app_tier_plans
(slug, name, description, is_active, visible_to_users, is_paid, payment_required, monthly_price_pence, annual_price_pence, sort_order, badge)
values
('free', 'Free', 'Core manual tracking and private beta access.', true, true, false, false, 0, 0, 10, 'Beta'),
('extra', 'Extra', 'Useful upgrades for more AI, label scans and investment lookups.', true, true, true, false, 299, 2990, 20, 'Testing'),
('plus', 'Plus', 'Deeper household, AI, health and wealth support.', true, true, true, false, 499, 4990, 30, 'Testing'),
('pro', 'Pro', 'All-out tier for advanced AI, stock pairing and future connected investing.', true, true, true, false, 999, 9990, 40, 'Testing'),
('staff', 'Staff', 'Internal/testing access. Not shown publicly.', true, false, false, false, 0, 0, 90, 'Internal')
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  is_active = excluded.is_active,
  visible_to_users = excluded.visible_to_users,
  is_paid = excluded.is_paid,
  payment_required = excluded.payment_required,
  monthly_price_pence = excluded.monthly_price_pence,
  annual_price_pence = excluded.annual_price_pence,
  sort_order = excluded.sort_order,
  badge = excluded.badge,
  updated_at = now();

-- ---------- Seed feature registry ----------
insert into public.app_tier_features(feature_key, category, name, description)
values
('ai_chat', 'AI', 'AI chat / questions', 'Ask LOOP questions about your own household data.'),
('ai_food_parse', 'AI', 'AI food parsing', 'Freehand meal/drink parsing.'),
('ai_label_scan', 'AI', 'Label scanner', 'Read nutrition/supplement labels.'),
('ai_monthly_spend_cap', 'AI', 'AI spend cap', 'Soft monthly AI spend guardrail used before hard billing enforcement.'),
('household_members', 'Household', 'Household members', 'Number of household members/profiles.'),
('nutrition_logging', 'Health', 'Nutrition logging', 'Daily food, drink and nutrient tracking.'),
('nutrition_insights', 'Health', 'Nutrition insights', 'Daily/weekly/monthly nutrition summaries.'),
('wealth_manual', 'Wealth', 'Manual wealth tracking', 'Manual income, bills, assets and liabilities.'),
('investment_lookup', 'Wealth', 'Investment lookup', 'Search stocks, ETFs and common funds.'),
('stock_pairing', 'Wealth', 'Stock / ETF pairing', 'Pair manually tracked holdings to market instruments.'),
('investment_merged_charts', 'Wealth', 'Merged investment charts', 'Hide old legacy charts once holdings are paired; restore on downgrade/no pairing.'),
('market_data_realtime', 'Wealth', 'Realtime market data', 'Realtime or paid market integrations.'),
('snaptrade', 'Wealth', 'SnapTrade integration', 'Brokerage/investment account connection.'),
('data_export', 'Account', 'Data export', 'Export user/household data.')
on conflict (feature_key) do update set
  category = excluded.category,
  name = excluded.name,
  description = excluded.description,
  updated_at = now();

-- ---------- Seed feature limits by tier ----------
insert into public.app_tier_plan_features(plan_slug, feature_key, enabled, limit_value, limit_period, enforcement_mode, health_status, user_message)
values
-- Free
('free','ai_chat',true,10,'day','audit','active','10 AI questions/day during beta.'),
('free','ai_food_parse',true,10,'day','audit','active','10 freehand AI food parses/day.'),
('free','ai_label_scan',true,5,'month','audit','active','5 label scans/month.'),
('free','ai_monthly_spend_cap',true,1.00,'month','warn','active','Approx £1/month soft AI spend cap during beta.'),
('free','household_members',true,4,'none','audit','active','Up to 4 household profiles.'),
('free','nutrition_logging',true,null,'none','audit','active','Nutrition logging enabled.'),
('free','nutrition_insights',true,null,'none','audit','active','Basic nutrition insights.'),
('free','wealth_manual',true,null,'none','audit','active','Manual wealth tracking enabled.'),
('free','investment_lookup',true,25,'month','audit','active','25 delayed/basic investment lookups/month.'),
('free','stock_pairing',false,0,'none','upgrade','hidden','Pairing requires Extra.'),
('free','investment_merged_charts',true,0,'none','audit','active','Legacy/manual charts remain visible.'),
('free','market_data_realtime',false,null,'none','upgrade','hidden','Realtime data requires Pro later.'),
('free','snaptrade',false,null,'none','upgrade','hidden','SnapTrade requires Pro later.'),
('free','data_export',false,null,'none','upgrade','hidden','Export requires Plus.'),

-- Extra £2.99
('extra','ai_chat',true,35,'day','audit','active','35 AI questions/day.'),
('extra','ai_food_parse',true,30,'day','audit','active','30 freehand AI food parses/day.'),
('extra','ai_label_scan',true,20,'month','audit','active','20 label scans/month.'),
('extra','ai_monthly_spend_cap',true,3.00,'month','warn','active','Approx £3/month soft AI spend cap.'),
('extra','household_members',true,6,'none','audit','active','Up to 6 household profiles.'),
('extra','nutrition_logging',true,null,'none','audit','active','Nutrition logging enabled.'),
('extra','nutrition_insights',true,null,'none','audit','active','Improved nutrition insights.'),
('extra','wealth_manual',true,null,'none','audit','active','Manual wealth tracking enabled.'),
('extra','investment_lookup',true,100,'month','audit','active','100 delayed/basic investment lookups/month.'),
('extra','stock_pairing',true,3,'none','warn','active','Pair up to 3 holdings to stocks/ETFs.'),
('extra','investment_merged_charts',true,3,'none','audit','active','Hide legacy charts only for paired holdings; restore if unpaired/downgraded.'),
('extra','market_data_realtime',false,null,'none','upgrade','hidden','Realtime data requires Pro later.'),
('extra','snaptrade',false,null,'none','upgrade','hidden','SnapTrade requires Pro later.'),
('extra','data_export',false,null,'none','upgrade','hidden','Export requires Plus.'),

-- Plus £4.99
('plus','ai_chat',true,100,'day','audit','active','100 AI questions/day.'),
('plus','ai_food_parse',true,100,'day','audit','active','100 freehand AI food parses/day.'),
('plus','ai_label_scan',true,100,'month','audit','active','100 label scans/month.'),
('plus','ai_monthly_spend_cap',true,8.00,'month','warn','active','Approx £8/month soft AI spend cap.'),
('plus','household_members',true,8,'none','audit','active','Up to 8 household profiles.'),
('plus','nutrition_logging',true,null,'none','audit','active','Nutrition logging enabled.'),
('plus','nutrition_insights',true,null,'none','audit','active','Deeper nutrition insights.'),
('plus','wealth_manual',true,null,'none','audit','active','Manual wealth tracking enabled.'),
('plus','investment_lookup',true,250,'month','audit','active','250 delayed/basic investment lookups/month.'),
('plus','stock_pairing',true,10,'none','warn','active','Pair up to 10 holdings to stocks/ETFs.'),
('plus','investment_merged_charts',true,10,'none','audit','active','Hide legacy charts only for paired holdings; restore if unpaired/downgraded.'),
('plus','market_data_realtime',false,null,'none','upgrade','hidden','Realtime data requires Pro later.'),
('plus','snaptrade',false,null,'none','upgrade','hidden','SnapTrade requires Pro later.'),
('plus','data_export',true,null,'none','audit','active','Export enabled.'),

-- Pro £9.99
('pro','ai_chat',true,300,'day','audit','active','300 AI questions/day.'),
('pro','ai_food_parse',true,500,'day','audit','active','500 freehand AI food parses/day.'),
('pro','ai_label_scan',true,500,'month','audit','active','500 label scans/month.'),
('pro','ai_monthly_spend_cap',true,20.00,'month','warn','active','Approx £20/month soft AI spend cap.'),
('pro','household_members',true,15,'none','audit','active','Up to 15 household profiles.'),
('pro','nutrition_logging',true,null,'none','audit','active','Nutrition logging enabled.'),
('pro','nutrition_insights',true,null,'none','audit','active','Advanced nutrition insights.'),
('pro','wealth_manual',true,null,'none','audit','active','Manual wealth tracking enabled.'),
('pro','investment_lookup',true,1000,'month','audit','active','1000 delayed/basic investment lookups/month.'),
('pro','stock_pairing',true,9999,'none','audit','active','Unlimited practical stock/ETF pairing during beta.'),
('pro','investment_merged_charts',true,9999,'none','audit','active','Hide legacy charts for paired holdings; restore when downgraded/unpaired.'),
('pro','market_data_realtime',true,null,'none','audit','degraded','Realtime data available when provider/payment is connected.'),
('pro','snaptrade',true,null,'none','audit','degraded','SnapTrade beta access.'),
('pro','data_export',true,null,'none','audit','active','Export enabled.')
on conflict (plan_slug, feature_key) do update set
  enabled = excluded.enabled,
  limit_value = excluded.limit_value,
  limit_period = excluded.limit_period,
  enforcement_mode = excluded.enforcement_mode,
  health_status = excluded.health_status,
  user_message = excluded.user_message,
  updated_at = now();

-- Make sure all auth users have a plan row.
insert into public.app_user_plan_memberships(user_id, plan_slug, status, source)
select u.id, 'free', 'active', 'default'
from auth.users u
where not exists (
  select 1 from public.app_user_plan_memberships m where m.user_id = u.id
);

insert into public.app_user_investment_chart_preferences(user_id)
select u.id
from auth.users u
where not exists (
  select 1 from public.app_user_investment_chart_preferences p where p.user_id = u.id
);

-- ---------- RPC: plan comparison table ----------
drop function if exists public.app_plan_comparison_rpc();

create or replace function public.app_plan_comparison_rpc()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_plans jsonb;
  v_rows jsonb;
begin
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'slug', slug,
      'name', name,
      'description', description,
      'monthly_price_pence', monthly_price_pence,
      'annual_price_pence', annual_price_pence,
      'badge', badge,
      'sort_order', sort_order
    )
    order by sort_order
  ), '[]'::jsonb)
  into v_plans
  from public.app_tier_plans
  where is_active = true and visible_to_users = true;

  select coalesce(jsonb_agg(feature_row order by category, name), '[]'::jsonb)
  into v_rows
  from (
    select jsonb_build_object(
      'feature_key', f.feature_key,
      'category', f.category,
      'name', f.name,
      'description', f.description,
      'plans', coalesce(jsonb_object_agg(
        p.slug,
        jsonb_build_object(
          'enabled', coalesce(pf.enabled, false),
          'limit_value', pf.limit_value,
          'limit_period', pf.limit_period,
          'health_status', coalesce(pf.health_status, 'hidden'),
          'enforcement_mode', coalesce(pf.enforcement_mode, 'upgrade'),
          'message', pf.user_message
        )
      ) filter (where p.slug is not null), '{}'::jsonb)
    ) as feature_row,
    f.category,
    f.name
    from public.app_tier_features f
    cross join public.app_tier_plans p
    left join public.app_tier_plan_features pf
      on pf.feature_key = f.feature_key
     and pf.plan_slug = p.slug
    where f.is_active = true
      and p.is_active = true
      and p.visible_to_users = true
    group by f.feature_key, f.category, f.name, f.description
  ) x;

  return jsonb_build_object('plans', v_plans, 'features', v_rows);
end;
$$;

grant execute on function public.app_plan_comparison_rpc() to authenticated;

-- ---------- RPC: user plan ----------
drop function if exists public.app_get_my_plan();

create or replace function public.app_get_my_plan()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan_slug text;
  v_plan jsonb;
  v_features jsonb;
  v_requests jsonb;
  v_comparison jsonb;
begin
  if v_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  insert into public.app_user_plan_memberships(user_id, plan_slug, status, source)
  values (v_user_id, 'free', 'active', 'default')
  on conflict (user_id) do nothing;

  insert into public.app_user_investment_chart_preferences(user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  select m.plan_slug
  into v_plan_slug
  from public.app_user_plan_memberships m
  where m.user_id = v_user_id
    and m.status in ('active','trialing','pending')
  limit 1;

  v_plan_slug := coalesce(v_plan_slug, 'free');

  select to_jsonb(p.*)
  into v_plan
  from public.app_tier_plans p
  where p.slug = v_plan_slug;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'feature_key', f.feature_key,
      'category', f.category,
      'name', f.name,
      'description', f.description,
      'enabled', pf.enabled,
      'limit_value', pf.limit_value,
      'limit_period', pf.limit_period,
      'enforcement_mode', pf.enforcement_mode,
      'health_status', pf.health_status,
      'user_message', pf.user_message
    )
    order by f.category, f.name
  ), '[]'::jsonb)
  into v_features
  from public.app_tier_plan_features pf
  join public.app_tier_features f on f.feature_key = pf.feature_key
  where pf.plan_slug = v_plan_slug
    and f.is_active = true;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc), '[]'::jsonb)
  into v_requests
  from (
    select *
    from public.app_plan_change_requests
    where user_id = v_user_id
    order by created_at desc
    limit 5
  ) r;

  select public.app_plan_comparison_rpc() into v_comparison;

  return jsonb_build_object(
    'current_plan', v_plan,
    'features', v_features,
    'recent_requests', v_requests,
    'comparison', v_comparison
  );
end;
$$;

grant execute on function public.app_get_my_plan() to authenticated;

-- ---------- Admin notification helpers ----------
create or replace function public.app_platform_admin_user_ids()
returns table(user_id uuid)
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
begin
  return query
  select u.id
  from auth.users u
  where lower(coalesce(u.raw_app_meta_data ->> 'role', '')) in ('owner', 'admin', 'super_admin')
     or lower(coalesce(u.raw_app_meta_data ->> 'loop_admin', '')) in ('true','1','yes')
     or lower(coalesce(u.raw_app_meta_data ->> 'admin', '')) in ('true','1','yes');
end;
$$;

grant execute on function public.app_platform_admin_user_ids() to authenticated;

create or replace function public.app_create_admin_notification(
  p_type text,
  p_title text,
  p_body text,
  p_actor_user_id uuid default null,
  p_related_table text default null,
  p_related_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_admin_count integer := 0;
  v_admin uuid;
begin
  for v_admin in select user_id from public.app_platform_admin_user_ids()
  loop
    insert into public.app_admin_notifications(
      type, title, body, actor_user_id, target_admin_user_id, related_table, related_id, metadata
    )
    values (
      p_type, p_title, p_body, p_actor_user_id, v_admin, p_related_table, p_related_id, coalesce(p_metadata, '{}'::jsonb)
    );
    v_admin_count := v_admin_count + 1;
  end loop;

  -- Fallback: if no auth metadata admins are found yet, create one global admin notification.
  if v_admin_count = 0 then
    insert into public.app_admin_notifications(
      type, title, body, actor_user_id, target_admin_user_id, related_table, related_id, metadata
    )
    values (
      p_type, p_title, p_body, p_actor_user_id, null, p_related_table, p_related_id, coalesce(p_metadata, '{}'::jsonb)
    );
  end if;

  return jsonb_build_object('ok', true, 'admin_count', v_admin_count);
end;
$$;

grant execute on function public.app_create_admin_notification(text,text,text,uuid,text,uuid,jsonb) to authenticated;

-- ---------- RPC: beta plan change request now notifies admin ----------
drop function if exists public.app_request_plan_change(text, text);

create or replace function public.app_request_plan_change(
  p_plan_slug text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_current text;
  v_request_id uuid;
  v_requested_name text;
begin
  if v_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  if not exists (
    select 1 from public.app_tier_plans
    where slug = p_plan_slug
      and is_active = true
      and visible_to_users = true
  ) then
    raise exception 'Plan is not available.';
  end if;

  insert into public.app_user_plan_memberships(user_id, plan_slug, status, source)
  values (v_user_id, 'free', 'active', 'default')
  on conflict (user_id) do nothing;

  select plan_slug into v_current
  from public.app_user_plan_memberships
  where user_id = v_user_id
  limit 1;

  select name into v_requested_name from public.app_tier_plans where slug = p_plan_slug;

  insert into public.app_plan_change_requests(user_id, requested_plan_slug, current_plan_slug, note)
  values (v_user_id, p_plan_slug, coalesce(v_current, 'free'), p_note)
  returning id into v_request_id;

  perform public.app_create_admin_notification(
    'plan_change_request',
    'Plan upgrade requested',
    concat('A beta user requested ', coalesce(v_requested_name, p_plan_slug), '. Review it in Tier Control Centre.'),
    v_user_id,
    'app_plan_change_requests',
    v_request_id,
    jsonb_build_object(
      'requested_plan_slug', p_plan_slug,
      'current_plan_slug', coalesce(v_current, 'free'),
      'note', p_note
    )
  );

  return jsonb_build_object(
    'ok', true,
    'request_id', v_request_id,
    'message', 'Plan change request logged and admin notified.'
  );
end;
$$;

grant execute on function public.app_request_plan_change(text, text) to authenticated;

-- ---------- Admin: list users ----------
drop function if exists public.app_admin_list_users_by_tier(text);

create or replace function public.app_admin_list_users_by_tier(p_plan_slug text default null)
returns table (
  user_id uuid,
  anon_user_ref text,
  masked_email text,
  plan_slug text,
  status text,
  source text,
  manual_override boolean,
  override_reason text,
  starts_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
begin
  if not public.app_is_platform_admin() then
    raise exception 'Admin access required.';
  end if;

  insert into public.app_user_plan_memberships(user_id, plan_slug, status, source)
  select u.id, 'free', 'active', 'default'
  from auth.users u
  where not exists (
    select 1 from public.app_user_plan_memberships m where m.user_id = u.id
  );

  return query
  select
    u.id as user_id,
    concat('user_', left(encode(digest(u.id::text, 'sha256'), 'hex'), 10)) as anon_user_ref,
    case
      when u.email is null then null
      else concat(left(u.email, 2), '***@', split_part(u.email, '@', 2))
    end as masked_email,
    coalesce(m.plan_slug, 'free') as plan_slug,
    coalesce(m.status, 'active') as status,
    coalesce(m.source, 'default') as source,
    coalesce(m.manual_override, false) as manual_override,
    m.override_reason,
    m.starts_at,
    m.expires_at,
    u.created_at
  from auth.users u
  left join public.app_user_plan_memberships m on m.user_id = u.id
  where p_plan_slug is null or coalesce(m.plan_slug, 'free') = p_plan_slug
  order by u.created_at desc;
end;
$$;

grant execute on function public.app_admin_list_users_by_tier(text) to authenticated;

-- ---------- Admin: dashboard ----------
drop function if exists public.app_admin_tier_dashboard();

create or replace function public.app_admin_tier_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_plans jsonb;
  v_users_by_tier jsonb;
  v_users jsonb;
  v_requests jsonb;
  v_features jsonb;
  v_notifications jsonb;
  v_comparison jsonb;
begin
  if not public.app_is_platform_admin() then
    raise exception 'Admin access required.';
  end if;

  insert into public.app_user_plan_memberships(user_id, plan_slug, status, source)
  select u.id, 'free', 'active', 'default'
  from auth.users u
  where not exists (
    select 1 from public.app_user_plan_memberships m where m.user_id = u.id
  );

  select coalesce(jsonb_agg(to_jsonb(p.*) order by p.sort_order), '[]'::jsonb)
  into v_plans
  from public.app_tier_plans p;

  select coalesce(jsonb_agg(row_to_json(x) order by x.sort_order), '[]'::jsonb)
  into v_users_by_tier
  from (
    select
      p.slug as plan_slug,
      p.name as plan_name,
      p.sort_order,
      count(m.user_id)::int as user_count,
      count(m.user_id) filter (where m.manual_override)::int as manual_overrides
    from public.app_tier_plans p
    left join public.app_user_plan_memberships m on m.plan_slug = p.slug
    group by p.slug, p.name, p.sort_order
  ) x;

  select coalesce(jsonb_agg(to_jsonb(urow) order by urow.created_at desc), '[]'::jsonb)
  into v_users
  from public.app_admin_list_users_by_tier(null) urow;

  select coalesce(jsonb_agg(to_jsonb(r.*) order by r.created_at desc), '[]'::jsonb)
  into v_requests
  from public.app_plan_change_requests r
  where r.status = 'requested';

  select coalesce(jsonb_agg(to_jsonb(f.*) order by f.category, f.name), '[]'::jsonb)
  into v_features
  from public.app_tier_features f;

  select coalesce(jsonb_agg(to_jsonb(n.*) order by n.created_at desc), '[]'::jsonb)
  into v_notifications
  from public.app_admin_notifications n
  where n.status = 'unread'
    and (n.target_admin_user_id is null or n.target_admin_user_id = auth.uid())
  limit 25;

  select public.app_plan_comparison_rpc() into v_comparison;

  return jsonb_build_object(
    'plans', v_plans,
    'users_by_tier', v_users_by_tier,
    'users', v_users,
    'pending_requests', v_requests,
    'features', v_features,
    'admin_notifications', v_notifications,
    'comparison', v_comparison
  );
end;
$$;

grant execute on function public.app_admin_tier_dashboard() to authenticated;

-- ---------- Admin: update user plan ----------
drop function if exists public.app_admin_set_user_plan(uuid, text, text, timestamptz);

create or replace function public.app_admin_set_user_plan(
  p_user_id uuid,
  p_plan_slug text,
  p_reason text default null,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
begin
  if not public.app_is_platform_admin() then
    raise exception 'Admin access required.';
  end if;

  if not exists (select 1 from public.app_tier_plans where slug = p_plan_slug) then
    raise exception 'Plan does not exist.';
  end if;

  insert into public.app_user_plan_memberships(
    user_id, plan_slug, status, source, manual_override, override_reason, expires_at, created_by
  )
  values (
    p_user_id, p_plan_slug, 'active', 'admin', true, p_reason, p_expires_at, auth.uid()
  )
  on conflict (user_id) do update set
    plan_slug = excluded.plan_slug,
    status = 'active',
    source = 'admin',
    manual_override = true,
    override_reason = excluded.override_reason,
    expires_at = excluded.expires_at,
    created_by = excluded.created_by,
    updated_at = now();

  -- Do not permanently destroy old charts. Pairing view logic should consult tier + this preference.
  insert into public.app_user_investment_chart_preferences(user_id)
  values (p_user_id)
  on conflict (user_id) do update set
    restore_legacy_charts_on_downgrade = true,
    updated_at = now();

  return jsonb_build_object('ok', true, 'user_id', p_user_id, 'plan_slug', p_plan_slug);
end;
$$;

grant execute on function public.app_admin_set_user_plan(uuid, text, text, timestamptz) to authenticated;

-- ---------- Admin: approve/reject request ----------
drop function if exists public.app_admin_review_plan_request(uuid, boolean, text);

create or replace function public.app_admin_review_plan_request(
  p_request_id uuid,
  p_approve boolean,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_request record;
begin
  if not public.app_is_platform_admin() then
    raise exception 'Admin access required.';
  end if;

  select * into v_request
  from public.app_plan_change_requests
  where id = p_request_id;

  if v_request.id is null then
    raise exception 'Request not found.';
  end if;

  update public.app_plan_change_requests
  set status = case when p_approve then 'approved' else 'rejected' end,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_note = p_note
  where id = p_request_id;

  if p_approve then
    perform public.app_admin_set_user_plan(
      v_request.user_id,
      v_request.requested_plan_slug,
      coalesce(p_note, 'Approved beta upgrade request.'),
      null
    );
  end if;

  return jsonb_build_object('ok', true, 'approved', p_approve, 'request_id', p_request_id);
end;
$$;

grant execute on function public.app_admin_review_plan_request(uuid, boolean, text) to authenticated;

-- ---------- Admin controls ----------
drop function if exists public.app_admin_upsert_plan(text,text,text,boolean,boolean,boolean,integer,integer,integer);

create or replace function public.app_admin_upsert_plan(
  p_slug text,
  p_name text,
  p_description text,
  p_visible_to_users boolean,
  p_is_active boolean,
  p_is_paid boolean,
  p_monthly_price_pence integer,
  p_annual_price_pence integer,
  p_sort_order integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_slug text := lower(regexp_replace(coalesce(p_slug, ''), '[^a-zA-Z0-9_-]+', '_', 'g'));
begin
  if not public.app_is_platform_admin() then
    raise exception 'Admin access required.';
  end if;

  if v_slug = '' then raise exception 'Plan slug is required.'; end if;

  insert into public.app_tier_plans(
    slug, name, description, visible_to_users, is_active, is_paid,
    monthly_price_pence, annual_price_pence, sort_order
  )
  values (
    v_slug, p_name, p_description, p_visible_to_users, p_is_active, p_is_paid,
    coalesce(p_monthly_price_pence, 0), coalesce(p_annual_price_pence, 0), coalesce(p_sort_order, 100)
  )
  on conflict (slug) do update set
    name = excluded.name,
    description = excluded.description,
    visible_to_users = excluded.visible_to_users,
    is_active = excluded.is_active,
    is_paid = excluded.is_paid,
    monthly_price_pence = excluded.monthly_price_pence,
    annual_price_pence = excluded.annual_price_pence,
    sort_order = excluded.sort_order,
    updated_at = now();

  return jsonb_build_object('ok', true, 'slug', v_slug);
end;
$$;

grant execute on function public.app_admin_upsert_plan(text,text,text,boolean,boolean,boolean,integer,integer,integer) to authenticated;

drop function if exists public.app_admin_set_feature_for_plan(text,text,boolean,numeric,text,text,text,text);

create or replace function public.app_admin_set_feature_for_plan(
  p_plan_slug text,
  p_feature_key text,
  p_enabled boolean,
  p_limit_value numeric default null,
  p_limit_period text default 'none',
  p_enforcement_mode text default 'audit',
  p_health_status text default 'active',
  p_user_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
begin
  if not public.app_is_platform_admin() then
    raise exception 'Admin access required.';
  end if;

  if not exists (select 1 from public.app_tier_plans where slug = p_plan_slug) then
    raise exception 'Plan does not exist.';
  end if;

  if not exists (select 1 from public.app_tier_features where feature_key = p_feature_key) then
    raise exception 'Feature does not exist.';
  end if;

  insert into public.app_tier_plan_features(
    plan_slug, feature_key, enabled, limit_value, limit_period, enforcement_mode, health_status, user_message
  )
  values (
    p_plan_slug, p_feature_key, coalesce(p_enabled, false), p_limit_value,
    coalesce(p_limit_period, 'none'), coalesce(p_enforcement_mode, 'audit'),
    coalesce(p_health_status, 'active'), p_user_message
  )
  on conflict (plan_slug, feature_key) do update set
    enabled = excluded.enabled,
    limit_value = excluded.limit_value,
    limit_period = excluded.limit_period,
    enforcement_mode = excluded.enforcement_mode,
    health_status = excluded.health_status,
    user_message = excluded.user_message,
    updated_at = now();

  return jsonb_build_object('ok', true, 'plan_slug', p_plan_slug, 'feature_key', p_feature_key);
end;
$$;

grant execute on function public.app_admin_set_feature_for_plan(text,text,boolean,numeric,text,text,text,text) to authenticated;

-- ---------- Investment tier explainer ----------
drop function if exists public.app_investment_tier_explainer();

create or replace function public.app_investment_tier_explainer()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan_slug text;
  v_payload jsonb;
begin
  if v_user_id is null then raise exception 'Not authenticated.'; end if;

  insert into public.app_user_plan_memberships(user_id, plan_slug, status, source)
  values (v_user_id, 'free', 'active', 'default')
  on conflict (user_id) do nothing;

  select plan_slug into v_plan_slug
  from public.app_user_plan_memberships
  where user_id = v_user_id;

  select jsonb_build_object(
    'plan', to_jsonb(p.*),
    'investment_lookup', to_jsonb(il.*),
    'stock_pairing', to_jsonb(sp.*),
    'merged_charts', to_jsonb(mc.*),
    'realtime_market_data', to_jsonb(rt.*),
    'snaptrade', to_jsonb(st.*),
    'upgrade_url', '/account/plan'
  )
  into v_payload
  from public.app_tier_plans p
  left join public.app_tier_plan_features il on il.plan_slug = p.slug and il.feature_key = 'investment_lookup'
  left join public.app_tier_plan_features sp on sp.plan_slug = p.slug and sp.feature_key = 'stock_pairing'
  left join public.app_tier_plan_features mc on mc.plan_slug = p.slug and mc.feature_key = 'investment_merged_charts'
  left join public.app_tier_plan_features rt on rt.plan_slug = p.slug and rt.feature_key = 'market_data_realtime'
  left join public.app_tier_plan_features st on st.plan_slug = p.slug and st.feature_key = 'snaptrade'
  where p.slug = coalesce(v_plan_slug, 'free');

  return v_payload;
end;
$$;

grant execute on function public.app_investment_tier_explainer() to authenticated;

-- ---------- Healthcheck ----------
create or replace function public.app_v2762_healthcheck()
returns table(check_name text, ok boolean, detail text)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select 'tier_tables'::text,
    to_regclass('public.app_tier_plans') is not null
    and to_regclass('public.app_tier_features') is not null
    and to_regclass('public.app_tier_plan_features') is not null
    and to_regclass('public.app_user_plan_memberships') is not null,
    'Tier tables exist.'::text
  union all
  select 'extra_plan_299'::text,
    exists(select 1 from public.app_tier_plans where slug = 'extra' and monthly_price_pence = 299),
    'Extra tier is seeded at £2.99.'::text
  union all
  select 'plus_plan_499'::text,
    exists(select 1 from public.app_tier_plans where slug = 'plus' and monthly_price_pence = 499),
    'Plus tier is seeded at £4.99.'::text
  union all
  select 'pro_plan_999'::text,
    exists(select 1 from public.app_tier_plans where slug = 'pro' and monthly_price_pence = 999),
    'Pro tier is seeded at £9.99.'::text
  union all
  select 'admin_notifications'::text,
    to_regclass('public.app_admin_notifications') is not null,
    'Admin notification table exists.'::text
  union all
  select 'plan_change_request_rpc'::text,
    exists(select 1 from pg_proc where proname = 'app_request_plan_change'),
    'Plan request RPC exists and notifies admin.'::text
  union all
  select 'admin_user_list_rpc'::text,
    exists(select 1 from pg_proc where proname = 'app_admin_list_users_by_tier'),
    'Admin user list RPC exists.'::text
  union all
  select 'plan_comparison_rpc'::text,
    exists(select 1 from pg_proc where proname = 'app_plan_comparison_rpc'),
    'Plan comparison RPC exists.'::text
  union all
  select 'chart_preferences'::text,
    to_regclass('public.app_user_investment_chart_preferences') is not null,
    'Investment chart preference table exists.'::text;
$$;

grant execute on function public.app_v2762_healthcheck() to anon;
grant execute on function public.app_v2762_healthcheck() to authenticated;


-- ============================================================
-- db/v27_63_food_log_ui_serving_intelligence.sql
-- ============================================================

-- v27.63 Inside LOOP food logging UI + serving intelligence
--
-- Adds:
-- - Product serving-size options for known/staple products
-- - Drink volume validation helpers
-- - Product display-name normalisation with ml/g bracket suffixes
-- - Nutrition AI resolution policy tables
-- - Product data correction queue
-- - Healthcheck
--
-- This is additive and avoids hard references to your existing nutrition tables,
-- so it can be run safely even if your food card schema is still moving.

create extension if not exists pgcrypto;

create or replace function public.app_set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.app_food_product_serving_options (
  id uuid primary key default gen_random_uuid(),
  product_card_id uuid,
  canonical_name text not null,
  brand_name text,
  product_family text,
  variant_name text,
  serving_label text not null,
  serving_ml numeric,
  serving_g numeric,
  prepared_volume_ml numeric,
  package_count integer,
  is_default boolean not null default false,
  confidence integer not null default 50,
  data_source text not null default 'starter_seed',
  source_url text,
  requires_user_confirmation boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_food_product_serving_options_confidence_check check (confidence between 0 and 100),
  constraint app_food_product_serving_options_size_check check (
    serving_ml is not null
    or serving_g is not null
    or prepared_volume_ml is not null
  )
);

create index if not exists app_food_product_serving_options_name_idx
on public.app_food_product_serving_options using gin (to_tsvector('simple', canonical_name || ' ' || coalesce(brand_name,'') || ' ' || coalesce(variant_name,'') || ' ' || coalesce(product_family,'')));

create index if not exists app_food_product_serving_options_card_idx
on public.app_food_product_serving_options(product_card_id);

drop trigger if exists app_food_product_serving_options_updated_at on public.app_food_product_serving_options;
create trigger app_food_product_serving_options_updated_at
before update on public.app_food_product_serving_options
for each row execute function public.app_set_updated_at();

create table if not exists public.app_food_product_aliases (
  id uuid primary key default gen_random_uuid(),
  alias text not null,
  canonical_name text not null,
  brand_name text,
  product_family text,
  confidence integer not null default 60,
  created_at timestamptz not null default now(),
  constraint app_food_product_aliases_confidence_check check (confidence between 0 and 100)
);

create table if not exists public.app_food_product_corrections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  household_id uuid,
  card_id uuid,
  log_entry_id uuid,
  submitted_name text,
  source_url text,
  label_image_url text,
  note text,
  correction_kind text not null default 'product_data',
  status text not null default 'queued',
  ai_attempts integer not null default 0,
  resolved_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_food_product_corrections_kind_check check (correction_kind in ('product_data','serving_size','label_scan','image_fix','nutrition_fix','allergen_fix')),
  constraint app_food_product_corrections_status_check check (status in ('queued','processing','needs_review','applied','rejected','failed'))
);

drop trigger if exists app_food_product_corrections_updated_at on public.app_food_product_corrections;
create trigger app_food_product_corrections_updated_at
before update on public.app_food_product_corrections
for each row execute function public.app_set_updated_at();

create table if not exists public.app_nutrition_ai_resolution_policies (
  task_key text primary key,
  task_name text not null,
  model_lane text not null,
  preferred_model_env_key text not null,
  fallback_model_env_key text,
  requires_source boolean not null default false,
  requires_vision boolean not null default false,
  max_prompt_tokens integer not null default 6000,
  max_output_tokens integer not null default 1400,
  monthly_cost_cap_pence integer not null default 0,
  confidence_floor integer not null default 70,
  auto_apply_floor integer not null default 90,
  enabled boolean not null default true,
  instructions text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_nutrition_ai_resolution_policies_confidence_check check (
    confidence_floor between 0 and 100 and auto_apply_floor between 0 and 100
  )
);

drop trigger if exists app_nutrition_ai_resolution_policies_updated_at on public.app_nutrition_ai_resolution_policies;
create trigger app_nutrition_ai_resolution_policies_updated_at
before update on public.app_nutrition_ai_resolution_policies
for each row execute function public.app_set_updated_at();

create table if not exists public.app_nutrition_ai_resolution_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  task_key text references public.app_nutrition_ai_resolution_policies(task_key),
  subject_kind text not null,
  subject_id uuid,
  input_payload jsonb not null default '{}'::jsonb,
  output_payload jsonb,
  confidence integer,
  status text not null default 'queued',
  model_used text,
  source_url text,
  cost_estimate_pence numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_nutrition_ai_resolution_runs_status_check check (status in ('queued','processing','needs_review','auto_applied','applied','failed','rejected')),
  constraint app_nutrition_ai_resolution_runs_confidence_check check (confidence is null or confidence between 0 and 100)
);

drop trigger if exists app_nutrition_ai_resolution_runs_updated_at on public.app_nutrition_ai_resolution_runs;
create trigger app_nutrition_ai_resolution_runs_updated_at
before update on public.app_nutrition_ai_resolution_runs
for each row execute function public.app_set_updated_at();

alter table public.app_food_product_serving_options enable row level security;
alter table public.app_food_product_aliases enable row level security;
alter table public.app_food_product_corrections enable row level security;
alter table public.app_nutrition_ai_resolution_policies enable row level security;
alter table public.app_nutrition_ai_resolution_runs enable row level security;

drop policy if exists "serving options readable" on public.app_food_product_serving_options;
create policy "serving options readable" on public.app_food_product_serving_options
for select to authenticated using (true);

drop policy if exists "serving options service writable" on public.app_food_product_serving_options;
create policy "serving options service writable" on public.app_food_product_serving_options
for all to authenticated
using (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','owner','super_admin') or coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin', '') = 'true')
with check (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','owner','super_admin') or coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin', '') = 'true');

drop policy if exists "product aliases readable" on public.app_food_product_aliases;
create policy "product aliases readable" on public.app_food_product_aliases
for select to authenticated using (true);

drop policy if exists "corrections self insert" on public.app_food_product_corrections;
create policy "corrections self insert" on public.app_food_product_corrections
for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "corrections self or admin read" on public.app_food_product_corrections;
create policy "corrections self or admin read" on public.app_food_product_corrections
for select to authenticated
using (
  user_id = auth.uid()
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','owner','super_admin')
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin', '') = 'true'
);

drop policy if exists "ai policies readable" on public.app_nutrition_ai_resolution_policies;
create policy "ai policies readable" on public.app_nutrition_ai_resolution_policies
for select to authenticated using (true);

drop policy if exists "ai policies admin all" on public.app_nutrition_ai_resolution_policies;
create policy "ai policies admin all" on public.app_nutrition_ai_resolution_policies
for all to authenticated
using (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','owner','super_admin') or coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin', '') = 'true')
with check (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','owner','super_admin') or coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin', '') = 'true');

drop policy if exists "ai runs self read" on public.app_nutrition_ai_resolution_runs;
create policy "ai runs self read" on public.app_nutrition_ai_resolution_runs
for select to authenticated
using (
  user_id = auth.uid()
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','owner','super_admin')
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin', '') = 'true'
);

-- Starter serving-size seeds. These are size hints, not a claim that every market's nutrition label is identical.
insert into public.app_food_product_aliases(alias, canonical_name, brand_name, product_family, confidence)
values
('red bull sugarfree', 'Red Bull Sugarfree', 'Red Bull', 'Energy drink', 95),
('red bull sugar free', 'Red Bull Sugarfree', 'Red Bull', 'Energy drink', 95),
('redbull sugarfree', 'Red Bull Sugarfree', 'Red Bull', 'Energy drink', 95),
('redbull sugar free', 'Red Bull Sugarfree', 'Red Bull', 'Energy drink', 95),
('gfuel hype sauce', 'GFuel Hype Sauce 2.0', 'G FUEL', 'Powdered energy drink', 90),
('g fuel hype sauce', 'GFuel Hype Sauce 2.0', 'G FUEL', 'Powdered energy drink', 90),
('gfuel hype sauce 2.0', 'GFuel Hype Sauce 2.0', 'G FUEL', 'Powdered energy drink', 95),
('g fuel hype sauce 2.0', 'GFuel Hype Sauce 2.0', 'G FUEL', 'Powdered energy drink', 95)
on conflict (lower(alias)) do update set
  canonical_name = excluded.canonical_name,
  brand_name = excluded.brand_name,
  product_family = excluded.product_family,
  confidence = excluded.confidence;

insert into public.app_food_product_serving_options
(canonical_name, brand_name, product_family, variant_name, serving_label, serving_ml, serving_g, prepared_volume_ml, package_count, is_default, confidence, data_source, requires_user_confirmation)
values
('Red Bull Sugarfree', 'Red Bull', 'Energy drink', 'Sugarfree', '250ml can', 250, null, 250, 1, true, 92, 'starter_seed_size_hint', false),
('Red Bull Sugarfree', 'Red Bull', 'Energy drink', 'Sugarfree', '355ml can', 355, null, 355, 1, false, 80, 'starter_seed_size_hint', true),
('Red Bull Sugarfree', 'Red Bull', 'Energy drink', 'Sugarfree', '473ml can', 473, null, 473, 1, false, 75, 'starter_seed_size_hint', true),
('Red Bull Sugarfree', 'Red Bull', 'Energy drink', 'Sugarfree', '4 × 250ml cans', 250, null, 250, 4, false, 80, 'starter_seed_size_hint', true),
('GFuel Hype Sauce 2.0', 'G FUEL', 'Powdered energy drink', 'Hype Sauce 2.0', '1 scoop / 500ml prepared drink', null, 6.2, 500, 1, true, 92, 'starter_seed_label_user_supplied', false),
('GFuel Hype Sauce 2.0', 'G FUEL', 'Powdered energy drink', 'Hype Sauce 2.0', '1 scoop / 355ml prepared drink', null, 6.2, 355, 1, false, 80, 'starter_seed_label_user_supplied', true)
on conflict do nothing;

insert into public.app_nutrition_ai_resolution_policies
(task_key, task_name, model_lane, preferred_model_env_key, fallback_model_env_key, requires_source, requires_vision, max_prompt_tokens, max_output_tokens, monthly_cost_cap_pence, confidence_floor, auto_apply_floor, instructions)
values
(
  'freehand_food_parse',
  'Freehand food/drink parsing',
  'fast_structured_text',
  'LOOP_AI_FAST_MODEL',
  'LOOP_AI_REASONING_MODEL',
  false,
  false,
  4000,
  1200,
  300,
  65,
  88,
  'Classify the user text as product, drink product, recipe/meal, ingredient, or takeaway. Extract time, meal slot, serving size, drink volume, likely brand, and confidence. Never create a product card if the query is too broad; return candidates and ask for confirmation.'
),
(
  'product_source_resolution',
  'Product source resolution',
  'web_grounded_reasoning',
  'LOOP_AI_REASONING_MODEL',
  'LOOP_AI_FAST_MODEL',
  true,
  false,
  7000,
  1800,
  800,
  75,
  92,
  'Use official product pages, retailer listings, barcode databases, and label images in that order. Prefer product size and label facts over generic nutrition estimates. Where ml/g differs, create a separate serving option and append the size in brackets.'
),
(
  'label_image_scan',
  'Nutrition/supplement label scan',
  'vision_structured_extraction',
  'LOOP_AI_VISION_MODEL',
  'LOOP_AI_REASONING_MODEL',
  false,
  true,
  6000,
  1800,
  1000,
  75,
  93,
  'Extract exact nutrition facts, supplement facts, allergens, serving size, servings per pack, directions and other ingredients. Do not infer allergens from brand/category. If the label does not list an allergen, mark unknown rather than positive.'
),
(
  'allergen_validation',
  'Allergen validation',
  'strict_safety_classifier',
  'LOOP_AI_REASONING_MODEL',
  null,
  true,
  5000,
  1200,
  500,
  80,
  95,
  'Allergens are locked facts. Only mark an allergen as present when it is explicitly listed on the label/source or an ingredient is an established allergen. Avoid spreading inherited tags from unrelated products.'
)
on conflict (task_key) do update set
  task_name = excluded.task_name,
  model_lane = excluded.model_lane,
  preferred_model_env_key = excluded.preferred_model_env_key,
  fallback_model_env_key = excluded.fallback_model_env_key,
  requires_source = excluded.requires_source,
  requires_vision = excluded.requires_vision,
  max_prompt_tokens = excluded.max_prompt_tokens,
  max_output_tokens = excluded.max_output_tokens,
  monthly_cost_cap_pence = excluded.monthly_cost_cap_pence,
  confidence_floor = excluded.confidence_floor,
  auto_apply_floor = excluded.auto_apply_floor,
  instructions = excluded.instructions,
  updated_at = now();

drop function if exists public.app_food_serving_options_for_query(text, uuid);
create or replace function public.app_food_serving_options_for_query(
  p_query text,
  p_card_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_query text := lower(trim(coalesce(p_query, '')));
  v_canonical text;
  v_result jsonb;
begin
  select a.canonical_name
  into v_canonical
  from public.app_food_product_aliases a
  where lower(a.alias) = v_query
     or v_query like '%' || lower(a.alias) || '%'
     or lower(a.alias) like '%' || v_query || '%'
  order by a.confidence desc
  limit 1;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', o.id,
      'canonical_name', o.canonical_name,
      'brand_name', o.brand_name,
      'product_family', o.product_family,
      'variant_name', o.variant_name,
      'serving_label', o.serving_label,
      'serving_ml', o.serving_ml,
      'serving_g', o.serving_g,
      'prepared_volume_ml', o.prepared_volume_ml,
      'package_count', o.package_count,
      'is_default', o.is_default,
      'confidence', o.confidence,
      'requires_user_confirmation', o.requires_user_confirmation,
      'display_name', public.app_food_display_name_with_size(o.canonical_name, o.prepared_volume_ml, o.serving_ml, o.serving_g)
    )
    order by o.is_default desc, coalesce(o.prepared_volume_ml, o.serving_ml, 0), coalesce(o.serving_g, 0)
  ), '[]'::jsonb)
  into v_result
  from public.app_food_product_serving_options o
  where (p_card_id is not null and o.product_card_id = p_card_id)
     or (v_canonical is not null and lower(o.canonical_name) = lower(v_canonical))
     or (v_canonical is null and (
          lower(o.canonical_name) like '%' || v_query || '%'
       or lower(coalesce(o.brand_name,'')) like '%' || v_query || '%'
       or lower(coalesce(o.variant_name,'')) like '%' || v_query || '%'
     ));

  return jsonb_build_object(
    'query', p_query,
    'canonical_name', v_canonical,
    'options', v_result,
    'requires_volume_if_drink', coalesce(jsonb_array_length(v_result), 0) = 0
  );
end;
$$;

grant execute on function public.app_food_serving_options_for_query(text, uuid) to authenticated;

drop function if exists public.app_food_display_name_with_size(text, numeric, numeric, numeric);
create or replace function public.app_food_display_name_with_size(
  p_name text,
  p_prepared_volume_ml numeric default null,
  p_serving_ml numeric default null,
  p_serving_g numeric default null
)
returns text
language plpgsql
immutable
set search_path = public, pg_catalog
as $$
declare
  v_name text := trim(coalesce(p_name, 'Food / drink'));
  v_ml numeric := coalesce(p_prepared_volume_ml, p_serving_ml);
begin
  if v_ml is not null and position('ml' in lower(v_name)) = 0 then
    return v_name || ' (' || trim(to_char(v_ml, 'FM999999990.##')) || 'ml)';
  end if;

  if v_ml is null and p_serving_g is not null and position('g' in lower(v_name)) = 0 then
    return v_name || ' (' || trim(to_char(p_serving_g, 'FM999999990.##')) || 'g)';
  end if;

  return v_name;
end;
$$;

grant execute on function public.app_food_display_name_with_size(text, numeric, numeric, numeric) to authenticated;

drop function if exists public.app_food_log_drink_volume_required(text, text, numeric, uuid);
create or replace function public.app_food_log_drink_volume_required(
  p_meal_slot text,
  p_card_kind text,
  p_volume_ml numeric default null,
  p_serving_option_id uuid default null
)
returns jsonb
language plpgsql
stable
set search_path = public, pg_catalog
as $$
declare
  v_is_drink boolean := lower(coalesce(p_meal_slot, '')) = 'drink'
    or lower(coalesce(p_card_kind, '')) like '%drink%'
    or lower(coalesce(p_card_kind, '')) like '%beverage%';
  v_known_ml numeric;
begin
  if p_serving_option_id is not null then
    select coalesce(prepared_volume_ml, serving_ml)
    into v_known_ml
    from public.app_food_product_serving_options
    where id = p_serving_option_id;
  end if;

  return jsonb_build_object(
    'is_drink', v_is_drink,
    'volume_required', v_is_drink and coalesce(p_volume_ml, v_known_ml) is null,
    'effective_volume_ml', coalesce(p_volume_ml, v_known_ml),
    'message', case
      when v_is_drink and coalesce(p_volume_ml, v_known_ml) is null
        then 'Drink volume is required so hydration and timing context are accurate.'
      else null
    end
  );
end;
$$;

grant execute on function public.app_food_log_drink_volume_required(text, text, numeric, uuid) to authenticated;

drop function if exists public.app_queue_food_product_correction(uuid, uuid, uuid, text, text, text, text, text);
create or replace function public.app_queue_food_product_correction(
  p_household_id uuid,
  p_card_id uuid,
  p_log_entry_id uuid,
  p_submitted_name text,
  p_source_url text default null,
  p_label_image_url text default null,
  p_note text default null,
  p_correction_kind text default 'product_data'
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.';
  end if;

  insert into public.app_food_product_corrections(
    user_id,
    household_id,
    card_id,
    log_entry_id,
    submitted_name,
    source_url,
    label_image_url,
    note,
    correction_kind
  )
  values (
    auth.uid(),
    p_household_id,
    p_card_id,
    p_log_entry_id,
    p_submitted_name,
    p_source_url,
    p_label_image_url,
    p_note,
    coalesce(p_correction_kind, 'product_data')
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'correction_id', v_id,
    'status', 'queued',
    'message', 'Correction queued. The product card can be updated after AI/source review.'
  );
end;
$$;

grant execute on function public.app_queue_food_product_correction(uuid, uuid, uuid, text, text, text, text, text) to authenticated;

drop function if exists public.app_v2763_healthcheck();
create or replace function public.app_v2763_healthcheck()
returns table(check_name text, ok boolean, detail text)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select 'serving_options_table'::text,
    to_regclass('public.app_food_product_serving_options') is not null,
    'Product serving options table exists.'::text
  union all
  select 'serving_aliases_table'::text,
    to_regclass('public.app_food_product_aliases') is not null,
    'Product aliases table exists.'::text
  union all
  select 'red_bull_sizes_seeded'::text,
    exists(select 1 from public.app_food_product_serving_options where lower(canonical_name) = 'red bull sugarfree' and serving_ml = 250),
    'Red Bull Sugarfree 250ml starter serving is seeded.'::text
  union all
  select 'gfuel_prepared_seeded'::text,
    exists(select 1 from public.app_food_product_serving_options where lower(canonical_name) = 'gfuel hype sauce 2.0' and prepared_volume_ml = 500),
    'GFuel prepared 500ml starter serving is seeded.'::text
  union all
  select 'serving_options_rpc'::text,
    exists(select 1 from pg_proc where proname = 'app_food_serving_options_for_query'),
    'Serving option lookup RPC exists.'::text
  union all
  select 'drink_volume_required_rpc'::text,
    exists(select 1 from pg_proc where proname = 'app_food_log_drink_volume_required'),
    'Drink volume validation RPC exists.'::text
  union all
  select 'ai_policy_table'::text,
    to_regclass('public.app_nutrition_ai_resolution_policies') is not null,
    'Nutrition AI policy table exists.'::text
  union all
  select 'correction_queue'::text,
    to_regclass('public.app_food_product_corrections') is not null,
    'Product correction queue exists.'::text;
$$;

grant execute on function public.app_v2763_healthcheck() to anon;
grant execute on function public.app_v2763_healthcheck() to authenticated;


-- ============================================================
-- db/v27_64_food_log_sql_fix.sql
-- ============================================================

-- v27.64 Inside LOOP food logging SQL fix
--
-- Fixes v27.63 error:
-- ERROR fixed: invalid expression unique constraint removed in v27.76
--
-- Cause:
-- PostgreSQL table constraints cannot be declared as unique(lower(alias)).
-- This version uses alias_key as the unique normalised key instead.
--
-- Safe to run even if v27.63 partially ran.

create extension if not exists pgcrypto;

create or replace function public.app_set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -------------------------
-- Product serving options
-- -------------------------
create table if not exists public.app_food_product_serving_options (
  id uuid primary key default gen_random_uuid(),
  product_card_id uuid,
  canonical_name text not null,
  brand_name text,
  product_family text,
  variant_name text,
  serving_label text not null,
  serving_ml numeric,
  serving_g numeric,
  prepared_volume_ml numeric,
  package_count integer,
  is_default boolean not null default false,
  confidence integer not null default 50,
  data_source text not null default 'starter_seed',
  source_url text,
  requires_user_confirmation boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_food_product_serving_options_confidence_check check (confidence between 0 and 100),
  constraint app_food_product_serving_options_size_check check (
    serving_ml is not null
    or serving_g is not null
    or prepared_volume_ml is not null
  )
);

create index if not exists app_food_product_serving_options_name_idx
on public.app_food_product_serving_options
using gin (
  to_tsvector(
    'simple',
    canonical_name || ' ' || coalesce(brand_name,'') || ' ' || coalesce(variant_name,'') || ' ' || coalesce(product_family,'')
  )
);

create index if not exists app_food_product_serving_options_card_idx
on public.app_food_product_serving_options(product_card_id);

create unique index if not exists app_food_product_serving_options_unique_size_idx
on public.app_food_product_serving_options(
  lower(canonical_name),
  lower(serving_label),
  coalesce(serving_ml, -1),
  coalesce(serving_g, -1),
  coalesce(prepared_volume_ml, -1),
  coalesce(package_count, -1)
);

drop trigger if exists app_food_product_serving_options_updated_at on public.app_food_product_serving_options;
create trigger app_food_product_serving_options_updated_at
before update on public.app_food_product_serving_options
for each row execute function public.app_set_updated_at();

-- -------------------------
-- Product aliases
-- -------------------------
create table if not exists public.app_food_product_aliases (
  id uuid primary key default gen_random_uuid(),
  alias text not null,
  alias_key text not null,
  canonical_name text not null,
  brand_name text,
  product_family text,
  confidence integer not null default 60,
  created_at timestamptz not null default now(),
  constraint app_food_product_aliases_confidence_check check (confidence between 0 and 100)
);

alter table public.app_food_product_aliases
add column if not exists alias_key text;

update public.app_food_product_aliases
set alias_key = lower(trim(alias))
where alias_key is null or alias_key = '';

alter table public.app_food_product_aliases
alter column alias_key set default '';

-- Remove duplicate alias keys if a previous manual attempt inserted duplicates.
delete from public.app_food_product_aliases a
using public.app_food_product_aliases b
where a.alias_key = b.alias_key
  and a.id > b.id;

create unique index if not exists app_food_product_aliases_alias_key_idx
on public.app_food_product_aliases(alias_key);

-- -------------------------
-- Correction queue
-- -------------------------
create table if not exists public.app_food_product_corrections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  household_id uuid,
  card_id uuid,
  log_entry_id uuid,
  submitted_name text,
  source_url text,
  label_image_url text,
  note text,
  correction_kind text not null default 'product_data',
  status text not null default 'queued',
  ai_attempts integer not null default 0,
  resolved_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_food_product_corrections_kind_check check (correction_kind in ('product_data','serving_size','label_scan','image_fix','nutrition_fix','allergen_fix')),
  constraint app_food_product_corrections_status_check check (status in ('queued','processing','needs_review','applied','rejected','failed'))
);

drop trigger if exists app_food_product_corrections_updated_at on public.app_food_product_corrections;
create trigger app_food_product_corrections_updated_at
before update on public.app_food_product_corrections
for each row execute function public.app_set_updated_at();

-- -------------------------
-- AI nutrition model policies
-- -------------------------
create table if not exists public.app_nutrition_ai_resolution_policies (
  task_key text primary key,
  task_name text not null,
  model_lane text not null,
  preferred_model_env_key text not null,
  fallback_model_env_key text,
  requires_source boolean not null default false,
  requires_vision boolean not null default false,
  max_prompt_tokens integer not null default 6000,
  max_output_tokens integer not null default 1400,
  monthly_cost_cap_pence integer not null default 0,
  confidence_floor integer not null default 70,
  auto_apply_floor integer not null default 90,
  enabled boolean not null default true,
  instructions text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_nutrition_ai_resolution_policies_confidence_check check (
    confidence_floor between 0 and 100 and auto_apply_floor between 0 and 100
  )
);

drop trigger if exists app_nutrition_ai_resolution_policies_updated_at on public.app_nutrition_ai_resolution_policies;
create trigger app_nutrition_ai_resolution_policies_updated_at
before update on public.app_nutrition_ai_resolution_policies
for each row execute function public.app_set_updated_at();

create table if not exists public.app_nutrition_ai_resolution_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  task_key text references public.app_nutrition_ai_resolution_policies(task_key),
  subject_kind text not null,
  subject_id uuid,
  input_payload jsonb not null default '{}'::jsonb,
  output_payload jsonb,
  confidence integer,
  status text not null default 'queued',
  model_used text,
  source_url text,
  cost_estimate_pence numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_nutrition_ai_resolution_runs_status_check check (status in ('queued','processing','needs_review','auto_applied','applied','failed','rejected')),
  constraint app_nutrition_ai_resolution_runs_confidence_check check (confidence is null or confidence between 0 and 100)
);

drop trigger if exists app_nutrition_ai_resolution_runs_updated_at on public.app_nutrition_ai_resolution_runs;
create trigger app_nutrition_ai_resolution_runs_updated_at
before update on public.app_nutrition_ai_resolution_runs
for each row execute function public.app_set_updated_at();

-- -------------------------
-- RLS
-- -------------------------
alter table public.app_food_product_serving_options enable row level security;
alter table public.app_food_product_aliases enable row level security;
alter table public.app_food_product_corrections enable row level security;
alter table public.app_nutrition_ai_resolution_policies enable row level security;
alter table public.app_nutrition_ai_resolution_runs enable row level security;

drop policy if exists "serving options readable" on public.app_food_product_serving_options;
create policy "serving options readable" on public.app_food_product_serving_options
for select to authenticated using (true);

drop policy if exists "serving options service writable" on public.app_food_product_serving_options;
create policy "serving options service writable" on public.app_food_product_serving_options
for all to authenticated
using (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','owner','super_admin')
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin', '') = 'true'
)
with check (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','owner','super_admin')
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin', '') = 'true'
);

drop policy if exists "product aliases readable" on public.app_food_product_aliases;
create policy "product aliases readable" on public.app_food_product_aliases
for select to authenticated using (true);

drop policy if exists "product aliases admin writable" on public.app_food_product_aliases;
create policy "product aliases admin writable" on public.app_food_product_aliases
for all to authenticated
using (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','owner','super_admin')
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin', '') = 'true'
)
with check (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','owner','super_admin')
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin', '') = 'true'
);

drop policy if exists "corrections self insert" on public.app_food_product_corrections;
create policy "corrections self insert" on public.app_food_product_corrections
for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "corrections self or admin read" on public.app_food_product_corrections;
create policy "corrections self or admin read" on public.app_food_product_corrections
for select to authenticated
using (
  user_id = auth.uid()
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','owner','super_admin')
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin', '') = 'true'
);

drop policy if exists "ai policies readable" on public.app_nutrition_ai_resolution_policies;
create policy "ai policies readable" on public.app_nutrition_ai_resolution_policies
for select to authenticated using (true);

drop policy if exists "ai policies admin all" on public.app_nutrition_ai_resolution_policies;
create policy "ai policies admin all" on public.app_nutrition_ai_resolution_policies
for all to authenticated
using (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','owner','super_admin')
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin', '') = 'true'
)
with check (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','owner','super_admin')
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin', '') = 'true'
);

drop policy if exists "ai runs self read" on public.app_nutrition_ai_resolution_runs;
create policy "ai runs self read" on public.app_nutrition_ai_resolution_runs
for select to authenticated
using (
  user_id = auth.uid()
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','owner','super_admin')
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin', '') = 'true'
);

-- -------------------------
-- Seed aliases
-- -------------------------
insert into public.app_food_product_aliases(alias, alias_key, canonical_name, brand_name, product_family, confidence)
values
('red bull sugarfree', lower('red bull sugarfree'), 'Red Bull Sugarfree', 'Red Bull', 'Energy drink', 95),
('red bull sugar free', lower('red bull sugar free'), 'Red Bull Sugarfree', 'Red Bull', 'Energy drink', 95),
('redbull sugarfree', lower('redbull sugarfree'), 'Red Bull Sugarfree', 'Red Bull', 'Energy drink', 95),
('redbull sugar free', lower('redbull sugar free'), 'Red Bull Sugarfree', 'Red Bull', 'Energy drink', 95),
('gfuel hype sauce', lower('gfuel hype sauce'), 'GFuel Hype Sauce 2.0', 'G FUEL', 'Powdered energy drink', 90),
('g fuel hype sauce', lower('g fuel hype sauce'), 'GFuel Hype Sauce 2.0', 'G FUEL', 'Powdered energy drink', 90),
('gfuel hype sauce 2.0', lower('gfuel hype sauce 2.0'), 'GFuel Hype Sauce 2.0', 'G FUEL', 'Powdered energy drink', 95),
('g fuel hype sauce 2.0', lower('g fuel hype sauce 2.0'), 'GFuel Hype Sauce 2.0', 'G FUEL', 'Powdered energy drink', 95)
on conflict (alias_key) do update set
  alias = excluded.alias,
  canonical_name = excluded.canonical_name,
  brand_name = excluded.brand_name,
  product_family = excluded.product_family,
  confidence = excluded.confidence;

-- -------------------------
-- Seed serving options
-- -------------------------
insert into public.app_food_product_serving_options
(canonical_name, brand_name, product_family, variant_name, serving_label, serving_ml, serving_g, prepared_volume_ml, package_count, is_default, confidence, data_source, requires_user_confirmation)
values
('Red Bull Sugarfree', 'Red Bull', 'Energy drink', 'Sugarfree', '250ml can', 250, null, 250, 1, true, 92, 'starter_seed_size_hint', false),
('Red Bull Sugarfree', 'Red Bull', 'Energy drink', 'Sugarfree', '355ml can', 355, null, 355, 1, false, 80, 'starter_seed_size_hint', true),
('Red Bull Sugarfree', 'Red Bull', 'Energy drink', 'Sugarfree', '473ml can', 473, null, 473, 1, false, 75, 'starter_seed_size_hint', true),
('Red Bull Sugarfree', 'Red Bull', 'Energy drink', 'Sugarfree', '4 × 250ml cans', 250, null, 250, 4, false, 80, 'starter_seed_size_hint', true),
('GFuel Hype Sauce 2.0', 'G FUEL', 'Powdered energy drink', 'Hype Sauce 2.0', '1 scoop / 500ml prepared drink', null, 6.2, 500, 1, true, 92, 'starter_seed_label_user_supplied', false),
('GFuel Hype Sauce 2.0', 'G FUEL', 'Powdered energy drink', 'Hype Sauce 2.0', '1 scoop / 355ml prepared drink', null, 6.2, 355, 1, false, 80, 'starter_seed_label_user_supplied', true)
on conflict (
  lower(canonical_name),
  lower(serving_label),
  coalesce(serving_ml, -1),
  coalesce(serving_g, -1),
  coalesce(prepared_volume_ml, -1),
  coalesce(package_count, -1)
) do update set
  brand_name = excluded.brand_name,
  product_family = excluded.product_family,
  variant_name = excluded.variant_name,
  is_default = excluded.is_default,
  confidence = excluded.confidence,
  data_source = excluded.data_source,
  requires_user_confirmation = excluded.requires_user_confirmation,
  updated_at = now();

-- -------------------------
-- Seed AI policies
-- -------------------------
insert into public.app_nutrition_ai_resolution_policies
(task_key, task_name, model_lane, preferred_model_env_key, fallback_model_env_key, requires_source, requires_vision, max_prompt_tokens, max_output_tokens, monthly_cost_cap_pence, confidence_floor, auto_apply_floor, instructions)
values
(
  'freehand_food_parse',
  'Freehand food/drink parsing',
  'fast_structured_text',
  'LOOP_AI_FAST_MODEL',
  'LOOP_AI_REASONING_MODEL',
  false,
  false,
  4000,
  1200,
  300,
  65,
  88,
  'Classify the user text as product, drink product, recipe/meal, ingredient, or takeaway. Extract time, meal slot, serving size, drink volume, likely brand, and confidence. Never create a product card if the query is too broad; return candidates and ask for confirmation.'
),
(
  'product_source_resolution',
  'Product source resolution',
  'web_grounded_reasoning',
  'LOOP_AI_REASONING_MODEL',
  'LOOP_AI_FAST_MODEL',
  true,
  false,
  7000,
  1800,
  800,
  75,
  92,
  'Use official product pages, retailer listings, barcode databases, and label images in that order. Prefer product size and label facts over generic nutrition estimates. Where ml/g differs, create a separate serving option and append the size in brackets.'
),
(
  'label_image_scan',
  'Nutrition/supplement label scan',
  'vision_structured_extraction',
  'LOOP_AI_VISION_MODEL',
  'LOOP_AI_REASONING_MODEL',
  false,
  true,
  6000,
  1800,
  1000,
  75,
  93,
  'Extract exact nutrition facts, supplement facts, allergens, serving size, servings per pack, directions and other ingredients. Do not infer allergens from brand/category. If the label does not list an allergen, mark unknown rather than positive.'
),
(
  'allergen_validation',
  'Allergen validation',
  'strict_safety_classifier',
  'LOOP_AI_REASONING_MODEL',
  null,
  true,
  5000,
  1200,
  500,
  80,
  95,
  'Allergens are locked facts. Only mark an allergen as present when it is explicitly listed on the label/source or an ingredient is an established allergen. Avoid spreading inherited tags from unrelated products.'
)
on conflict (task_key) do update set
  task_name = excluded.task_name,
  model_lane = excluded.model_lane,
  preferred_model_env_key = excluded.preferred_model_env_key,
  fallback_model_env_key = excluded.fallback_model_env_key,
  requires_source = excluded.requires_source,
  requires_vision = excluded.requires_vision,
  max_prompt_tokens = excluded.max_prompt_tokens,
  max_output_tokens = excluded.max_output_tokens,
  monthly_cost_cap_pence = excluded.monthly_cost_cap_pence,
  confidence_floor = excluded.confidence_floor,
  auto_apply_floor = excluded.auto_apply_floor,
  instructions = excluded.instructions,
  updated_at = now();

-- -------------------------
-- RPCs
-- -------------------------
drop function if exists public.app_food_display_name_with_size(text, numeric, numeric, numeric);
create or replace function public.app_food_display_name_with_size(
  p_name text,
  p_prepared_volume_ml numeric default null,
  p_serving_ml numeric default null,
  p_serving_g numeric default null
)
returns text
language plpgsql
immutable
set search_path = public, pg_catalog
as $$
declare
  v_name text := trim(coalesce(p_name, 'Food / drink'));
  v_ml numeric := coalesce(p_prepared_volume_ml, p_serving_ml);
begin
  if v_ml is not null and position('ml' in lower(v_name)) = 0 then
    return v_name || ' (' || trim(to_char(v_ml, 'FM999999990.##')) || 'ml)';
  end if;

  if v_ml is null and p_serving_g is not null and position('g' in lower(v_name)) = 0 then
    return v_name || ' (' || trim(to_char(p_serving_g, 'FM999999990.##')) || 'g)';
  end if;

  return v_name;
end;
$$;

grant execute on function public.app_food_display_name_with_size(text, numeric, numeric, numeric) to authenticated;

drop function if exists public.app_food_serving_options_for_query(text, uuid);
create or replace function public.app_food_serving_options_for_query(
  p_query text,
  p_card_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_query text := lower(trim(coalesce(p_query, '')));
  v_canonical text;
  v_result jsonb;
begin
  select a.canonical_name
  into v_canonical
  from public.app_food_product_aliases a
  where a.alias_key = v_query
     or v_query like '%' || a.alias_key || '%'
     or a.alias_key like '%' || v_query || '%'
  order by a.confidence desc
  limit 1;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', o.id,
      'canonical_name', o.canonical_name,
      'brand_name', o.brand_name,
      'product_family', o.product_family,
      'variant_name', o.variant_name,
      'serving_label', o.serving_label,
      'serving_ml', o.serving_ml,
      'serving_g', o.serving_g,
      'prepared_volume_ml', o.prepared_volume_ml,
      'package_count', o.package_count,
      'is_default', o.is_default,
      'confidence', o.confidence,
      'requires_user_confirmation', o.requires_user_confirmation,
      'display_name', public.app_food_display_name_with_size(o.canonical_name, o.prepared_volume_ml, o.serving_ml, o.serving_g)
    )
    order by o.is_default desc, coalesce(o.prepared_volume_ml, o.serving_ml, 0), coalesce(o.serving_g, 0)
  ), '[]'::jsonb)
  into v_result
  from public.app_food_product_serving_options o
  where (p_card_id is not null and o.product_card_id = p_card_id)
     or (v_canonical is not null and lower(o.canonical_name) = lower(v_canonical))
     or (v_canonical is null and (
          lower(o.canonical_name) like '%' || v_query || '%'
       or lower(coalesce(o.brand_name,'')) like '%' || v_query || '%'
       or lower(coalesce(o.variant_name,'')) like '%' || v_query || '%'
     ));

  return jsonb_build_object(
    'query', p_query,
    'canonical_name', v_canonical,
    'options', v_result,
    'requires_volume_if_drink', coalesce(jsonb_array_length(v_result), 0) = 0
  );
end;
$$;

grant execute on function public.app_food_serving_options_for_query(text, uuid) to authenticated;

drop function if exists public.app_food_log_drink_volume_required(text, text, numeric, uuid);
create or replace function public.app_food_log_drink_volume_required(
  p_meal_slot text,
  p_card_kind text,
  p_volume_ml numeric default null,
  p_serving_option_id uuid default null
)
returns jsonb
language plpgsql
stable
set search_path = public, pg_catalog
as $$
declare
  v_is_drink boolean := lower(coalesce(p_meal_slot, '')) = 'drink'
    or lower(coalesce(p_card_kind, '')) like '%drink%'
    or lower(coalesce(p_card_kind, '')) like '%beverage%';
  v_known_ml numeric;
begin
  if p_serving_option_id is not null then
    select coalesce(prepared_volume_ml, serving_ml)
    into v_known_ml
    from public.app_food_product_serving_options
    where id = p_serving_option_id;
  end if;

  return jsonb_build_object(
    'is_drink', v_is_drink,
    'volume_required', v_is_drink and coalesce(p_volume_ml, v_known_ml) is null,
    'effective_volume_ml', coalesce(p_volume_ml, v_known_ml),
    'message', case
      when v_is_drink and coalesce(p_volume_ml, v_known_ml) is null
        then 'Drink volume is required so hydration and timing context are accurate.'
      else null
    end
  );
end;
$$;

grant execute on function public.app_food_log_drink_volume_required(text, text, numeric, uuid) to authenticated;

drop function if exists public.app_queue_food_product_correction(uuid, uuid, uuid, text, text, text, text, text);
create or replace function public.app_queue_food_product_correction(
  p_household_id uuid,
  p_card_id uuid,
  p_log_entry_id uuid,
  p_submitted_name text,
  p_source_url text default null,
  p_label_image_url text default null,
  p_note text default null,
  p_correction_kind text default 'product_data'
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.';
  end if;

  insert into public.app_food_product_corrections(
    user_id,
    household_id,
    card_id,
    log_entry_id,
    submitted_name,
    source_url,
    label_image_url,
    note,
    correction_kind
  )
  values (
    auth.uid(),
    p_household_id,
    p_card_id,
    p_log_entry_id,
    p_submitted_name,
    p_source_url,
    p_label_image_url,
    p_note,
    coalesce(p_correction_kind, 'product_data')
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'correction_id', v_id,
    'status', 'queued',
    'message', 'Correction queued. The product card can be updated after AI/source review.'
  );
end;
$$;

grant execute on function public.app_queue_food_product_correction(uuid, uuid, uuid, text, text, text, text, text) to authenticated;

drop function if exists public.app_v2764_healthcheck();
create or replace function public.app_v2764_healthcheck()
returns table(check_name text, ok boolean, detail text)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select 'serving_options_table'::text,
    to_regclass('public.app_food_product_serving_options') is not null,
    'Product serving options table exists.'::text
  union all
  select 'serving_aliases_table'::text,
    to_regclass('public.app_food_product_aliases') is not null,
    'Product aliases table exists.'::text
  union all
  select 'alias_key_unique_index'::text,
    exists(select 1 from pg_indexes where schemaname = 'public' and indexname = 'app_food_product_aliases_alias_key_idx'),
    'Alias unique index exists without using invalid unique(lower(alias)) constraint.'::text
  union all
  select 'red_bull_sizes_seeded'::text,
    exists(select 1 from public.app_food_product_serving_options where lower(canonical_name) = 'red bull sugarfree' and serving_ml = 250),
    'Red Bull Sugarfree 250ml starter serving is seeded.'::text
  union all
  select 'gfuel_prepared_seeded'::text,
    exists(select 1 from public.app_food_product_serving_options where lower(canonical_name) = 'gfuel hype sauce 2.0' and prepared_volume_ml = 500),
    'GFuel prepared 500ml starter serving is seeded.'::text
  union all
  select 'serving_options_rpc'::text,
    exists(select 1 from pg_proc where proname = 'app_food_serving_options_for_query'),
    'Serving option lookup RPC exists.'::text
  union all
  select 'drink_volume_required_rpc'::text,
    exists(select 1 from pg_proc where proname = 'app_food_log_drink_volume_required'),
    'Drink volume validation RPC exists.'::text
  union all
  select 'ai_policy_table'::text,
    to_regclass('public.app_nutrition_ai_resolution_policies') is not null,
    'Nutrition AI policy table exists.'::text
  union all
  select 'correction_queue'::text,
    to_regclass('public.app_food_product_corrections') is not null,
    'Product correction queue exists.'::text;
$$;

grant execute on function public.app_v2764_healthcheck() to anon;
grant execute on function public.app_v2764_healthcheck() to authenticated;


-- ============================================================
-- db/v27_65_food_log_sql_fix_2.sql
-- ============================================================

-- v27.65 Inside LOOP food logging SQL fix 2
--
-- Fixes v27.64 error:
-- ERROR: 42601: VALUES lists must all be the same length
-- LINE 379: 'allergen_validation',
--
-- Cause:
-- The allergen_validation seed row was missing one boolean value for:
-- requires_source / requires_vision.
--
-- This file also avoids expression-based ON CONFLICT for serving-size seeds,
-- so it is safer if your Supabase/Postgres parser is picky.
--
-- Safe to run even if v27.63/v27.64 partially ran.

create extension if not exists pgcrypto;

create or replace function public.app_set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -------------------------
-- Product serving options
-- -------------------------
create table if not exists public.app_food_product_serving_options (
  id uuid primary key default gen_random_uuid(),
  product_card_id uuid,
  canonical_name text not null,
  brand_name text,
  product_family text,
  variant_name text,
  serving_label text not null,
  serving_ml numeric,
  serving_g numeric,
  prepared_volume_ml numeric,
  package_count integer,
  is_default boolean not null default false,
  confidence integer not null default 50,
  data_source text not null default 'starter_seed',
  source_url text,
  requires_user_confirmation boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_food_product_serving_options_confidence_check check (confidence between 0 and 100),
  constraint app_food_product_serving_options_size_check check (
    serving_ml is not null
    or serving_g is not null
    or prepared_volume_ml is not null
  )
);

create index if not exists app_food_product_serving_options_name_idx
on public.app_food_product_serving_options
using gin (
  to_tsvector(
    'simple',
    canonical_name || ' ' || coalesce(brand_name,'') || ' ' || coalesce(variant_name,'') || ' ' || coalesce(product_family,'')
  )
);

create index if not exists app_food_product_serving_options_card_idx
on public.app_food_product_serving_options(product_card_id);

create unique index if not exists app_food_product_serving_options_unique_size_idx
on public.app_food_product_serving_options(
  lower(canonical_name),
  lower(serving_label),
  coalesce(serving_ml, -1),
  coalesce(serving_g, -1),
  coalesce(prepared_volume_ml, -1),
  coalesce(package_count, -1)
);

drop trigger if exists app_food_product_serving_options_updated_at on public.app_food_product_serving_options;
create trigger app_food_product_serving_options_updated_at
before update on public.app_food_product_serving_options
for each row execute function public.app_set_updated_at();

-- -------------------------
-- Product aliases
-- -------------------------
create table if not exists public.app_food_product_aliases (
  id uuid primary key default gen_random_uuid(),
  alias text not null,
  alias_key text not null,
  canonical_name text not null,
  brand_name text,
  product_family text,
  confidence integer not null default 60,
  created_at timestamptz not null default now(),
  constraint app_food_product_aliases_confidence_check check (confidence between 0 and 100)
);

alter table public.app_food_product_aliases
add column if not exists alias_key text;

update public.app_food_product_aliases
set alias_key = lower(trim(alias))
where alias_key is null or alias_key = '';

delete from public.app_food_product_aliases a
using public.app_food_product_aliases b
where a.alias_key = b.alias_key
  and a.id::text > b.id::text;

alter table public.app_food_product_aliases
alter column alias_key set not null;

create unique index if not exists app_food_product_aliases_alias_key_idx
on public.app_food_product_aliases(alias_key);

-- -------------------------
-- Correction queue
-- -------------------------
create table if not exists public.app_food_product_corrections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  household_id uuid,
  card_id uuid,
  log_entry_id uuid,
  submitted_name text,
  source_url text,
  label_image_url text,
  note text,
  correction_kind text not null default 'product_data',
  status text not null default 'queued',
  ai_attempts integer not null default 0,
  resolved_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_food_product_corrections_kind_check check (correction_kind in ('product_data','serving_size','label_scan','image_fix','nutrition_fix','allergen_fix')),
  constraint app_food_product_corrections_status_check check (status in ('queued','processing','needs_review','applied','rejected','failed'))
);

drop trigger if exists app_food_product_corrections_updated_at on public.app_food_product_corrections;
create trigger app_food_product_corrections_updated_at
before update on public.app_food_product_corrections
for each row execute function public.app_set_updated_at();

-- -------------------------
-- AI nutrition model policies
-- -------------------------
create table if not exists public.app_nutrition_ai_resolution_policies (
  task_key text primary key,
  task_name text not null,
  model_lane text not null,
  preferred_model_env_key text not null,
  fallback_model_env_key text,
  requires_source boolean not null default false,
  requires_vision boolean not null default false,
  max_prompt_tokens integer not null default 6000,
  max_output_tokens integer not null default 1400,
  monthly_cost_cap_pence integer not null default 0,
  confidence_floor integer not null default 70,
  auto_apply_floor integer not null default 90,
  enabled boolean not null default true,
  instructions text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_nutrition_ai_resolution_policies_confidence_check check (
    confidence_floor between 0 and 100 and auto_apply_floor between 0 and 100
  )
);

drop trigger if exists app_nutrition_ai_resolution_policies_updated_at on public.app_nutrition_ai_resolution_policies;
create trigger app_nutrition_ai_resolution_policies_updated_at
before update on public.app_nutrition_ai_resolution_policies
for each row execute function public.app_set_updated_at();

create table if not exists public.app_nutrition_ai_resolution_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  task_key text references public.app_nutrition_ai_resolution_policies(task_key),
  subject_kind text not null,
  subject_id uuid,
  input_payload jsonb not null default '{}'::jsonb,
  output_payload jsonb,
  confidence integer,
  status text not null default 'queued',
  model_used text,
  source_url text,
  cost_estimate_pence numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_nutrition_ai_resolution_runs_status_check check (status in ('queued','processing','needs_review','auto_applied','applied','failed','rejected')),
  constraint app_nutrition_ai_resolution_runs_confidence_check check (confidence is null or confidence between 0 and 100)
);

drop trigger if exists app_nutrition_ai_resolution_runs_updated_at on public.app_nutrition_ai_resolution_runs;
create trigger app_nutrition_ai_resolution_runs_updated_at
before update on public.app_nutrition_ai_resolution_runs
for each row execute function public.app_set_updated_at();

-- -------------------------
-- RLS
-- -------------------------
alter table public.app_food_product_serving_options enable row level security;
alter table public.app_food_product_aliases enable row level security;
alter table public.app_food_product_corrections enable row level security;
alter table public.app_nutrition_ai_resolution_policies enable row level security;
alter table public.app_nutrition_ai_resolution_runs enable row level security;

drop policy if exists "serving options readable" on public.app_food_product_serving_options;
create policy "serving options readable" on public.app_food_product_serving_options
for select to authenticated using (true);

drop policy if exists "serving options service writable" on public.app_food_product_serving_options;
create policy "serving options service writable" on public.app_food_product_serving_options
for all to authenticated
using (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','owner','super_admin')
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin', '') = 'true'
)
with check (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','owner','super_admin')
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin', '') = 'true'
);

drop policy if exists "product aliases readable" on public.app_food_product_aliases;
create policy "product aliases readable" on public.app_food_product_aliases
for select to authenticated using (true);

drop policy if exists "product aliases admin writable" on public.app_food_product_aliases;
create policy "product aliases admin writable" on public.app_food_product_aliases
for all to authenticated
using (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','owner','super_admin')
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin', '') = 'true'
)
with check (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','owner','super_admin')
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin', '') = 'true'
);

drop policy if exists "corrections self insert" on public.app_food_product_corrections;
create policy "corrections self insert" on public.app_food_product_corrections
for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "corrections self or admin read" on public.app_food_product_corrections;
create policy "corrections self or admin read" on public.app_food_product_corrections
for select to authenticated
using (
  user_id = auth.uid()
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','owner','super_admin')
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin', '') = 'true'
);

drop policy if exists "ai policies readable" on public.app_nutrition_ai_resolution_policies;
create policy "ai policies readable" on public.app_nutrition_ai_resolution_policies
for select to authenticated using (true);

drop policy if exists "ai policies admin all" on public.app_nutrition_ai_resolution_policies;
create policy "ai policies admin all" on public.app_nutrition_ai_resolution_policies
for all to authenticated
using (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','owner','super_admin')
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin', '') = 'true'
)
with check (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','owner','super_admin')
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin', '') = 'true'
);

drop policy if exists "ai runs self read" on public.app_nutrition_ai_resolution_runs;
create policy "ai runs self read" on public.app_nutrition_ai_resolution_runs
for select to authenticated
using (
  user_id = auth.uid()
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','owner','super_admin')
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin', '') = 'true'
);

-- -------------------------
-- Seed aliases
-- -------------------------
insert into public.app_food_product_aliases(alias, alias_key, canonical_name, brand_name, product_family, confidence)
values
('red bull sugarfree', lower('red bull sugarfree'), 'Red Bull Sugarfree', 'Red Bull', 'Energy drink', 95),
('red bull sugar free', lower('red bull sugar free'), 'Red Bull Sugarfree', 'Red Bull', 'Energy drink', 95),
('redbull sugarfree', lower('redbull sugarfree'), 'Red Bull Sugarfree', 'Red Bull', 'Energy drink', 95),
('redbull sugar free', lower('redbull sugar free'), 'Red Bull Sugarfree', 'Red Bull', 'Energy drink', 95),
('gfuel hype sauce', lower('gfuel hype sauce'), 'GFuel Hype Sauce 2.0', 'G FUEL', 'Powdered energy drink', 90),
('g fuel hype sauce', lower('g fuel hype sauce'), 'GFuel Hype Sauce 2.0', 'G FUEL', 'Powdered energy drink', 90),
('gfuel hype sauce 2.0', lower('gfuel hype sauce 2.0'), 'GFuel Hype Sauce 2.0', 'G FUEL', 'Powdered energy drink', 95),
('g fuel hype sauce 2.0', lower('g fuel hype sauce 2.0'), 'GFuel Hype Sauce 2.0', 'G FUEL', 'Powdered energy drink', 95)
on conflict (alias_key) do update set
  alias = excluded.alias,
  canonical_name = excluded.canonical_name,
  brand_name = excluded.brand_name,
  product_family = excluded.product_family,
  confidence = excluded.confidence;

-- -------------------------
-- Seed serving options without ON CONFLICT expressions
-- -------------------------
with seed_servings as (
  select *
  from (
    values
      ('Red Bull Sugarfree'::text, 'Red Bull'::text, 'Energy drink'::text, 'Sugarfree'::text, '250ml can'::text, 250::numeric, null::numeric, 250::numeric, 1::integer, true::boolean, 92::integer, 'starter_seed_size_hint'::text, false::boolean),
      ('Red Bull Sugarfree', 'Red Bull', 'Energy drink', 'Sugarfree', '355ml can', 355::numeric, null::numeric, 355::numeric, 1, false, 80, 'starter_seed_size_hint', true),
      ('Red Bull Sugarfree', 'Red Bull', 'Energy drink', 'Sugarfree', '473ml can', 473::numeric, null::numeric, 473::numeric, 1, false, 75, 'starter_seed_size_hint', true),
      ('Red Bull Sugarfree', 'Red Bull', 'Energy drink', 'Sugarfree', '4 × 250ml cans', 250::numeric, null::numeric, 250::numeric, 4, false, 80, 'starter_seed_size_hint', true),
      ('GFuel Hype Sauce 2.0', 'G FUEL', 'Powdered energy drink', 'Hype Sauce 2.0', '1 scoop / 500ml prepared drink', null::numeric, 6.2::numeric, 500::numeric, 1, true, 92, 'starter_seed_label_user_supplied', false),
      ('GFuel Hype Sauce 2.0', 'G FUEL', 'Powdered energy drink', 'Hype Sauce 2.0', '1 scoop / 355ml prepared drink', null::numeric, 6.2::numeric, 355::numeric, 1, false, 80, 'starter_seed_label_user_supplied', true)
  ) as v(
    canonical_name,
    brand_name,
    product_family,
    variant_name,
    serving_label,
    serving_ml,
    serving_g,
    prepared_volume_ml,
    package_count,
    is_default,
    confidence,
    data_source,
    requires_user_confirmation
  )
)
insert into public.app_food_product_serving_options
(canonical_name, brand_name, product_family, variant_name, serving_label, serving_ml, serving_g, prepared_volume_ml, package_count, is_default, confidence, data_source, requires_user_confirmation)
select
  s.canonical_name,
  s.brand_name,
  s.product_family,
  s.variant_name,
  s.serving_label,
  s.serving_ml,
  s.serving_g,
  s.prepared_volume_ml,
  s.package_count,
  s.is_default,
  s.confidence,
  s.data_source,
  s.requires_user_confirmation
from seed_servings s
where not exists (
  select 1
  from public.app_food_product_serving_options existing
  where lower(existing.canonical_name) = lower(s.canonical_name)
    and lower(existing.serving_label) = lower(s.serving_label)
    and coalesce(existing.serving_ml, -1) = coalesce(s.serving_ml, -1)
    and coalesce(existing.serving_g, -1) = coalesce(s.serving_g, -1)
    and coalesce(existing.prepared_volume_ml, -1) = coalesce(s.prepared_volume_ml, -1)
    and coalesce(existing.package_count, -1) = coalesce(s.package_count, -1)
);

-- Ensure default flags are correct after repeat runs.
update public.app_food_product_serving_options
set is_default = false
where lower(canonical_name) in ('red bull sugarfree', 'gfuel hype sauce 2.0');

update public.app_food_product_serving_options
set is_default = true,
    requires_user_confirmation = false,
    confidence = greatest(confidence, 92)
where lower(canonical_name) = 'red bull sugarfree'
  and serving_ml = 250
  and prepared_volume_ml = 250;

update public.app_food_product_serving_options
set is_default = true,
    requires_user_confirmation = false,
    confidence = greatest(confidence, 92)
where lower(canonical_name) = 'gfuel hype sauce 2.0'
  and serving_g = 6.2
  and prepared_volume_ml = 500;

-- -------------------------
-- Seed AI policies
-- -------------------------
insert into public.app_nutrition_ai_resolution_policies
(task_key, task_name, model_lane, preferred_model_env_key, fallback_model_env_key, requires_source, requires_vision, max_prompt_tokens, max_output_tokens, monthly_cost_cap_pence, confidence_floor, auto_apply_floor, instructions)
values
(
  'freehand_food_parse',
  'Freehand food/drink parsing',
  'fast_structured_text',
  'LOOP_AI_FAST_MODEL',
  'LOOP_AI_REASONING_MODEL',
  false,
  false,
  4000,
  1200,
  300,
  65,
  88,
  'Classify the user text as product, drink product, recipe/meal, ingredient, or takeaway. Extract time, meal slot, serving size, drink volume, likely brand, and confidence. Never create a product card if the query is too broad; return candidates and ask for confirmation.'
),
(
  'product_source_resolution',
  'Product source resolution',
  'web_grounded_reasoning',
  'LOOP_AI_REASONING_MODEL',
  'LOOP_AI_FAST_MODEL',
  true,
  false,
  7000,
  1800,
  800,
  75,
  92,
  'Use official product pages, retailer listings, barcode databases, and label images in that order. Prefer product size and label facts over generic nutrition estimates. Where ml/g differs, create a separate serving option and append the size in brackets.'
),
(
  'label_image_scan',
  'Nutrition/supplement label scan',
  'vision_structured_extraction',
  'LOOP_AI_VISION_MODEL',
  'LOOP_AI_REASONING_MODEL',
  false,
  true,
  6000,
  1800,
  1000,
  75,
  93,
  'Extract exact nutrition facts, supplement facts, allergens, serving size, servings per pack, directions and other ingredients. Do not infer allergens from brand/category. If the label does not list an allergen, mark unknown rather than positive.'
),
(
  'allergen_validation',
  'Allergen validation',
  'strict_safety_classifier',
  'LOOP_AI_REASONING_MODEL',
  null,
  true,
  true,
  5000,
  1200,
  500,
  80,
  95,
  'Allergens are locked facts. Only mark an allergen as present when it is explicitly listed on the label/source or an ingredient is an established allergen. Avoid spreading inherited tags from unrelated products.'
)
on conflict (task_key) do update set
  task_name = excluded.task_name,
  model_lane = excluded.model_lane,
  preferred_model_env_key = excluded.preferred_model_env_key,
  fallback_model_env_key = excluded.fallback_model_env_key,
  requires_source = excluded.requires_source,
  requires_vision = excluded.requires_vision,
  max_prompt_tokens = excluded.max_prompt_tokens,
  max_output_tokens = excluded.max_output_tokens,
  monthly_cost_cap_pence = excluded.monthly_cost_cap_pence,
  confidence_floor = excluded.confidence_floor,
  auto_apply_floor = excluded.auto_apply_floor,
  instructions = excluded.instructions,
  updated_at = now();

-- -------------------------
-- RPCs
-- -------------------------
drop function if exists public.app_food_display_name_with_size(text, numeric, numeric, numeric);
create or replace function public.app_food_display_name_with_size(
  p_name text,
  p_prepared_volume_ml numeric default null,
  p_serving_ml numeric default null,
  p_serving_g numeric default null
)
returns text
language plpgsql
immutable
set search_path = public, pg_catalog
as $$
declare
  v_name text := trim(coalesce(p_name, 'Food / drink'));
  v_ml numeric := coalesce(p_prepared_volume_ml, p_serving_ml);
begin
  if v_ml is not null and position('ml' in lower(v_name)) = 0 then
    return v_name || ' (' || trim(to_char(v_ml, 'FM999999990.##')) || 'ml)';
  end if;

  if v_ml is null and p_serving_g is not null and position('g' in lower(v_name)) = 0 then
    return v_name || ' (' || trim(to_char(p_serving_g, 'FM999999990.##')) || 'g)';
  end if;

  return v_name;
end;
$$;

grant execute on function public.app_food_display_name_with_size(text, numeric, numeric, numeric) to authenticated;

drop function if exists public.app_food_serving_options_for_query(text, uuid);
create or replace function public.app_food_serving_options_for_query(
  p_query text,
  p_card_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_query text := lower(trim(coalesce(p_query, '')));
  v_canonical text;
  v_result jsonb;
begin
  select a.canonical_name
  into v_canonical
  from public.app_food_product_aliases a
  where a.alias_key = v_query
     or v_query like '%' || a.alias_key || '%'
     or a.alias_key like '%' || v_query || '%'
  order by a.confidence desc
  limit 1;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', o.id,
      'canonical_name', o.canonical_name,
      'brand_name', o.brand_name,
      'product_family', o.product_family,
      'variant_name', o.variant_name,
      'serving_label', o.serving_label,
      'serving_ml', o.serving_ml,
      'serving_g', o.serving_g,
      'prepared_volume_ml', o.prepared_volume_ml,
      'package_count', o.package_count,
      'is_default', o.is_default,
      'confidence', o.confidence,
      'requires_user_confirmation', o.requires_user_confirmation,
      'display_name', public.app_food_display_name_with_size(o.canonical_name, o.prepared_volume_ml, o.serving_ml, o.serving_g)
    )
    order by o.is_default desc, coalesce(o.prepared_volume_ml, o.serving_ml, 0), coalesce(o.serving_g, 0)
  ), '[]'::jsonb)
  into v_result
  from public.app_food_product_serving_options o
  where (p_card_id is not null and o.product_card_id = p_card_id)
     or (v_canonical is not null and lower(o.canonical_name) = lower(v_canonical))
     or (v_canonical is null and (
          lower(o.canonical_name) like '%' || v_query || '%'
       or lower(coalesce(o.brand_name,'')) like '%' || v_query || '%'
       or lower(coalesce(o.variant_name,'')) like '%' || v_query || '%'
     ));

  return jsonb_build_object(
    'query', p_query,
    'canonical_name', v_canonical,
    'options', v_result,
    'requires_volume_if_drink', coalesce(jsonb_array_length(v_result), 0) = 0
  );
end;
$$;

grant execute on function public.app_food_serving_options_for_query(text, uuid) to authenticated;

drop function if exists public.app_food_log_drink_volume_required(text, text, numeric, uuid);
create or replace function public.app_food_log_drink_volume_required(
  p_meal_slot text,
  p_card_kind text,
  p_volume_ml numeric default null,
  p_serving_option_id uuid default null
)
returns jsonb
language plpgsql
stable
set search_path = public, pg_catalog
as $$
declare
  v_is_drink boolean := lower(coalesce(p_meal_slot, '')) = 'drink'
    or lower(coalesce(p_card_kind, '')) like '%drink%'
    or lower(coalesce(p_card_kind, '')) like '%beverage%';
  v_known_ml numeric;
begin
  if p_serving_option_id is not null then
    select coalesce(prepared_volume_ml, serving_ml)
    into v_known_ml
    from public.app_food_product_serving_options
    where id = p_serving_option_id;
  end if;

  return jsonb_build_object(
    'is_drink', v_is_drink,
    'volume_required', v_is_drink and coalesce(p_volume_ml, v_known_ml) is null,
    'effective_volume_ml', coalesce(p_volume_ml, v_known_ml),
    'message', case
      when v_is_drink and coalesce(p_volume_ml, v_known_ml) is null
        then 'Drink volume is required so hydration and timing context are accurate.'
      else null
    end
  );
end;
$$;

grant execute on function public.app_food_log_drink_volume_required(text, text, numeric, uuid) to authenticated;

drop function if exists public.app_queue_food_product_correction(uuid, uuid, uuid, text, text, text, text, text);
create or replace function public.app_queue_food_product_correction(
  p_household_id uuid,
  p_card_id uuid,
  p_log_entry_id uuid,
  p_submitted_name text,
  p_source_url text default null,
  p_label_image_url text default null,
  p_note text default null,
  p_correction_kind text default 'product_data'
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.';
  end if;

  insert into public.app_food_product_corrections(
    user_id,
    household_id,
    card_id,
    log_entry_id,
    submitted_name,
    source_url,
    label_image_url,
    note,
    correction_kind
  )
  values (
    auth.uid(),
    p_household_id,
    p_card_id,
    p_log_entry_id,
    p_submitted_name,
    p_source_url,
    p_label_image_url,
    p_note,
    coalesce(p_correction_kind, 'product_data')
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'correction_id', v_id,
    'status', 'queued',
    'message', 'Correction queued. The product card can be updated after AI/source review.'
  );
end;
$$;

grant execute on function public.app_queue_food_product_correction(uuid, uuid, uuid, text, text, text, text, text) to authenticated;

-- -------------------------
-- Healthcheck
-- -------------------------
drop function if exists public.app_v2765_healthcheck();
create or replace function public.app_v2765_healthcheck()
returns table(check_name text, ok boolean, detail text)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select 'serving_options_table'::text,
    to_regclass('public.app_food_product_serving_options') is not null,
    'Product serving options table exists.'::text
  union all
  select 'serving_aliases_table'::text,
    to_regclass('public.app_food_product_aliases') is not null,
    'Product aliases table exists.'::text
  union all
  select 'alias_key_unique_index'::text,
    exists(select 1 from pg_indexes where schemaname = 'public' and indexname = 'app_food_product_aliases_alias_key_idx'),
    'Alias unique index exists.'::text
  union all
  select 'red_bull_sizes_seeded'::text,
    exists(select 1 from public.app_food_product_serving_options where lower(canonical_name) = 'red bull sugarfree' and serving_ml = 250),
    'Red Bull Sugarfree 250ml starter serving is seeded.'::text
  union all
  select 'gfuel_prepared_seeded'::text,
    exists(select 1 from public.app_food_product_serving_options where lower(canonical_name) = 'gfuel hype sauce 2.0' and prepared_volume_ml = 500),
    'GFuel prepared 500ml starter serving is seeded.'::text
  union all
  select 'serving_options_rpc'::text,
    exists(select 1 from pg_proc where proname = 'app_food_serving_options_for_query'),
    'Serving option lookup RPC exists.'::text
  union all
  select 'drink_volume_required_rpc'::text,
    exists(select 1 from pg_proc where proname = 'app_food_log_drink_volume_required'),
    'Drink volume validation RPC exists.'::text
  union all
  select 'ai_policy_table'::text,
    to_regclass('public.app_nutrition_ai_resolution_policies') is not null,
    'Nutrition AI policy table exists.'::text
  union all
  select 'allergen_policy_seeded'::text,
    exists(select 1 from public.app_nutrition_ai_resolution_policies where task_key = 'allergen_validation' and requires_source = true and requires_vision = true),
    'Allergen validation policy has matching values and is seeded.'::text
  union all
  select 'correction_queue'::text,
    to_regclass('public.app_food_product_corrections') is not null,
    'Product correction queue exists.'::text;
$$;

grant execute on function public.app_v2765_healthcheck() to anon;
grant execute on function public.app_v2765_healthcheck() to authenticated;


-- ============================================================
-- db/v27_66_product_allergen_source_tree_fix.sql
-- ============================================================

-- v27.66 Inside LOOP product allergen/source/ingredient-tree + edit-card fix support
--
-- Adds:
-- - Separate allergen presence statuses: contains vs may_contain
-- - Product source snapshots: formal name, image, ingredients, allergen text, price + retailer
-- - Ingredient tree rows for nested/expandable ingredients
-- - RPCs to queue source refreshes and upsert allergen facts safely
--
-- This is additive and safe after v27.65.

create extension if not exists pgcrypto;

create or replace function public.app_set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ------------------------------------------------------------
-- Product source snapshots
-- ------------------------------------------------------------
create table if not exists public.app_food_product_source_snapshots (
  id uuid primary key default gen_random_uuid(),
  card_id uuid,
  submitted_by uuid references auth.users(id) on delete set null,
  source_url text not null,
  source_host text,
  retailer_name text,
  formal_name text,
  main_image_url text,
  price_amount numeric,
  price_currency text default 'GBP',
  price_text text,
  ingredients_text text,
  allergens_text text,
  nutrition_text text,
  raw_payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  confidence integer not null default 50,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_food_product_source_snapshots_status_check check (status in ('queued','processing','needs_review','applied','rejected','failed')),
  constraint app_food_product_source_snapshots_confidence_check check (confidence between 0 and 100)
);

create index if not exists app_food_product_source_snapshots_card_idx
on public.app_food_product_source_snapshots(card_id);

create index if not exists app_food_product_source_snapshots_status_idx
on public.app_food_product_source_snapshots(status, created_at desc);

create index if not exists app_food_product_source_snapshots_source_idx
on public.app_food_product_source_snapshots(source_host);

drop trigger if exists app_food_product_source_snapshots_updated_at on public.app_food_product_source_snapshots;
create trigger app_food_product_source_snapshots_updated_at
before update on public.app_food_product_source_snapshots
for each row execute function public.app_set_updated_at();

-- ------------------------------------------------------------
-- Product allergen facts
-- ------------------------------------------------------------
create table if not exists public.app_food_product_allergen_facts (
  id uuid primary key default gen_random_uuid(),
  card_id uuid,
  source_snapshot_id uuid references public.app_food_product_source_snapshots(id) on delete set null,
  allergen_key text not null,
  allergen_label text not null,
  presence text not null default 'unknown',
  evidence_text text,
  source_url text,
  confidence integer not null default 50,
  locked boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_food_product_allergen_facts_presence_check check (presence in ('contains','may_contain','not_present','unknown')),
  constraint app_food_product_allergen_facts_confidence_check check (confidence between 0 and 100)
);

create unique index if not exists app_food_product_allergen_facts_card_key_presence_idx
on public.app_food_product_allergen_facts(
  coalesce(card_id, '00000000-0000-0000-0000-000000000000'::uuid),
  lower(allergen_key),
  presence
);

create index if not exists app_food_product_allergen_facts_card_idx
on public.app_food_product_allergen_facts(card_id);

drop trigger if exists app_food_product_allergen_facts_updated_at on public.app_food_product_allergen_facts;
create trigger app_food_product_allergen_facts_updated_at
before update on public.app_food_product_allergen_facts
for each row execute function public.app_set_updated_at();

-- ------------------------------------------------------------
-- Ingredient tree facts
-- ------------------------------------------------------------
create table if not exists public.app_food_ingredient_tree_items (
  id uuid primary key default gen_random_uuid(),
  card_id uuid,
  source_snapshot_id uuid references public.app_food_product_source_snapshots(id) on delete set null,
  parent_id uuid references public.app_food_ingredient_tree_items(id) on delete cascade,
  sort_order integer not null default 0,
  section_label text not null default 'Ingredients',
  ingredient_name text not null,
  quantity_text text,
  percentage numeric,
  raw_text text,
  has_children boolean not null default false,
  info_mode text not null default 'expand',
  confidence integer not null default 60,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_food_ingredient_tree_items_info_mode_check check (info_mode in ('expand','link_to_product','raw_only')),
  constraint app_food_ingredient_tree_items_confidence_check check (confidence between 0 and 100)
);

create index if not exists app_food_ingredient_tree_items_card_idx
on public.app_food_ingredient_tree_items(card_id, parent_id, sort_order);

drop trigger if exists app_food_ingredient_tree_items_updated_at on public.app_food_ingredient_tree_items;
create trigger app_food_ingredient_tree_items_updated_at
before update on public.app_food_ingredient_tree_items
for each row execute function public.app_set_updated_at();

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
alter table public.app_food_product_source_snapshots enable row level security;
alter table public.app_food_product_allergen_facts enable row level security;
alter table public.app_food_ingredient_tree_items enable row level security;

drop policy if exists "source snapshots self or admin read" on public.app_food_product_source_snapshots;
create policy "source snapshots self or admin read" on public.app_food_product_source_snapshots
for select to authenticated
using (
  submitted_by = auth.uid()
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','owner','super_admin')
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin', '') = 'true'
);

drop policy if exists "source snapshots self insert" on public.app_food_product_source_snapshots;
create policy "source snapshots self insert" on public.app_food_product_source_snapshots
for insert to authenticated with check (submitted_by = auth.uid());

drop policy if exists "allergen facts readable" on public.app_food_product_allergen_facts;
create policy "allergen facts readable" on public.app_food_product_allergen_facts
for select to authenticated using (true);

drop policy if exists "ingredient tree readable" on public.app_food_ingredient_tree_items;
create policy "ingredient tree readable" on public.app_food_ingredient_tree_items
for select to authenticated using (true);

drop policy if exists "source/admin all allergen facts" on public.app_food_product_allergen_facts;
create policy "source/admin all allergen facts" on public.app_food_product_allergen_facts
for all to authenticated
using (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','owner','super_admin')
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin', '') = 'true'
)
with check (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','owner','super_admin')
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin', '') = 'true'
);

drop policy if exists "source/admin all ingredient tree" on public.app_food_ingredient_tree_items;
create policy "source/admin all ingredient tree" on public.app_food_ingredient_tree_items
for all to authenticated
using (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','owner','super_admin')
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin', '') = 'true'
)
with check (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','owner','super_admin')
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin', '') = 'true'
);

-- ------------------------------------------------------------
-- Helper: source host
-- ------------------------------------------------------------
drop function if exists public.app_url_host(text);
create or replace function public.app_url_host(p_url text)
returns text
language plpgsql
immutable
set search_path = public, pg_catalog
as $$
declare
  v_host text;
begin
  v_host := lower(regexp_replace(coalesce(p_url,''), '^https?://([^/?#]+).*$','\1'));
  v_host := regexp_replace(v_host, '^www\.', '');
  if v_host = coalesce(p_url,'') then
    return null;
  end if;
  return v_host;
end;
$$;

grant execute on function public.app_url_host(text) to authenticated;

-- ------------------------------------------------------------
-- Queue product source refresh
-- ------------------------------------------------------------
drop function if exists public.app_queue_product_source_refresh(uuid, text, text);
create or replace function public.app_queue_product_source_refresh(
  p_card_id uuid,
  p_source_url text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.';
  end if;

  if coalesce(trim(p_source_url), '') = '' then
    raise exception 'Source URL is required.';
  end if;

  insert into public.app_food_product_source_snapshots(
    card_id,
    submitted_by,
    source_url,
    source_host,
    raw_payload,
    status,
    confidence
  )
  values (
    p_card_id,
    auth.uid(),
    p_source_url,
    public.app_url_host(p_source_url),
    jsonb_build_object('note', p_note),
    'queued',
    50
  )
  returning id into v_id;

  -- Also mirror into the existing correction queue when present.
  if to_regclass('public.app_food_product_corrections') is not null then
    insert into public.app_food_product_corrections(
      user_id,
      card_id,
      source_url,
      note,
      correction_kind,
      status
    )
    values (
      auth.uid(),
      p_card_id,
      p_source_url,
      p_note,
      'product_data',
      'queued'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'snapshot_id', v_id,
    'status', 'queued',
    'message', 'Source refresh queued. LOOP will pull image, formal product name, ingredients, allergens, price and retailer.'
  );
end;
$$;

grant execute on function public.app_queue_product_source_refresh(uuid, text, text) to authenticated;

-- ------------------------------------------------------------
-- Upsert safe allergen fact
-- ------------------------------------------------------------
drop function if exists public.app_upsert_product_allergen_fact(uuid, uuid, text, text, text, text, text, integer);
create or replace function public.app_upsert_product_allergen_fact(
  p_card_id uuid,
  p_source_snapshot_id uuid,
  p_allergen_key text,
  p_allergen_label text,
  p_presence text,
  p_evidence_text text default null,
  p_source_url text default null,
  p_confidence integer default 75
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_id uuid;
  v_key text := lower(trim(p_allergen_key));
  v_presence text := lower(trim(p_presence));
begin
  if v_presence not in ('contains','may_contain','not_present','unknown') then
    raise exception 'Invalid allergen presence: %', p_presence;
  end if;

  insert into public.app_food_product_allergen_facts(
    card_id,
    source_snapshot_id,
    allergen_key,
    allergen_label,
    presence,
    evidence_text,
    source_url,
    confidence,
    locked
  )
  values (
    p_card_id,
    p_source_snapshot_id,
    v_key,
    coalesce(nullif(trim(p_allergen_label), ''), initcap(v_key)),
    v_presence,
    p_evidence_text,
    p_source_url,
    greatest(0, least(100, coalesce(p_confidence, 75))),
    true
  )
  on conflict (
    coalesce(card_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(allergen_key),
    presence
  ) do update set
    source_snapshot_id = excluded.source_snapshot_id,
    allergen_label = excluded.allergen_label,
    evidence_text = excluded.evidence_text,
    source_url = excluded.source_url,
    confidence = greatest(public.app_food_product_allergen_facts.confidence, excluded.confidence),
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.app_upsert_product_allergen_fact(uuid, uuid, text, text, text, text, text, integer) to authenticated;

-- ------------------------------------------------------------
-- Read card allergens split by actual vs may-contain
-- ------------------------------------------------------------
drop function if exists public.app_product_allergen_summary(uuid);
create or replace function public.app_product_allergen_summary(p_card_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select jsonb_build_object(
    'contains', coalesce(jsonb_agg(jsonb_build_object('key', allergen_key, 'label', allergen_label, 'evidence', evidence_text, 'confidence', confidence)) filter (where presence = 'contains'), '[]'::jsonb),
    'may_contain', coalesce(jsonb_agg(jsonb_build_object('key', allergen_key, 'label', allergen_label, 'evidence', evidence_text, 'confidence', confidence)) filter (where presence = 'may_contain'), '[]'::jsonb),
    'not_present', coalesce(jsonb_agg(jsonb_build_object('key', allergen_key, 'label', allergen_label)) filter (where presence = 'not_present'), '[]'::jsonb),
    'unknown', coalesce(jsonb_agg(jsonb_build_object('key', allergen_key, 'label', allergen_label)) filter (where presence = 'unknown'), '[]'::jsonb)
  )
  from public.app_food_product_allergen_facts
  where card_id = p_card_id;
$$;

grant execute on function public.app_product_allergen_summary(uuid) to authenticated;

-- ------------------------------------------------------------
-- Seed/adjust AI policy guardrail wording
-- ------------------------------------------------------------
insert into public.app_nutrition_ai_resolution_policies
(task_key, task_name, model_lane, preferred_model_env_key, fallback_model_env_key, requires_source, requires_vision, max_prompt_tokens, max_output_tokens, monthly_cost_cap_pence, confidence_floor, auto_apply_floor, instructions)
values
(
  'product_source_harvest',
  'Product source harvest',
  'web_grounded_extraction',
  'LOOP_AI_REASONING_MODEL',
  'LOOP_AI_FAST_MODEL',
  true,
  false,
  7000,
  1800,
  700,
  75,
  90,
  'When a product URL is supplied, extract formal product name, main product image, product page URL, ingredients text, allergen text, price, currency and retailer/site. Store may-contain allergens separately from contains allergens. Do not overwrite existing verified nutrition unless confidence is higher or admin approves.'
),
(
  'ingredient_tree_parse',
  'Ingredient tree parse',
  'structured_text',
  'LOOP_AI_FAST_MODEL',
  'LOOP_AI_REASONING_MODEL',
  false,
  false,
  5000,
  1800,
  400,
  70,
  88,
  'Parse ingredients into top-level ingredient rows and nested expandable sub-ingredients. Use expand mode for ingredients with bracketed make-up, e.g. lemon flavour topping [sugar, fats]. Use link_to_product only for clear reusable products such as ZOE Daily 30+ or branded sauces.'
)
on conflict (task_key) do update set
  task_name = excluded.task_name,
  model_lane = excluded.model_lane,
  preferred_model_env_key = excluded.preferred_model_env_key,
  fallback_model_env_key = excluded.fallback_model_env_key,
  requires_source = excluded.requires_source,
  requires_vision = excluded.requires_vision,
  max_prompt_tokens = excluded.max_prompt_tokens,
  max_output_tokens = excluded.max_output_tokens,
  monthly_cost_cap_pence = excluded.monthly_cost_cap_pence,
  confidence_floor = excluded.confidence_floor,
  auto_apply_floor = excluded.auto_apply_floor,
  instructions = excluded.instructions,
  updated_at = now();

-- ------------------------------------------------------------
-- Healthcheck
-- ------------------------------------------------------------
drop function if exists public.app_v2766_healthcheck();
create or replace function public.app_v2766_healthcheck()
returns table(check_name text, ok boolean, detail text)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select 'source_snapshots_table'::text,
    to_regclass('public.app_food_product_source_snapshots') is not null,
    'Product source snapshot table exists.'::text
  union all
  select 'allergen_facts_table'::text,
    to_regclass('public.app_food_product_allergen_facts') is not null,
    'Allergen facts table exists with contains/may_contain split.'::text
  union all
  select 'ingredient_tree_table'::text,
    to_regclass('public.app_food_ingredient_tree_items') is not null,
    'Ingredient tree table exists.'::text
  union all
  select 'queue_source_refresh_rpc'::text,
    exists(select 1 from pg_proc where proname = 'app_queue_product_source_refresh'),
    'Product source refresh queue RPC exists.'::text
  union all
  select 'allergen_summary_rpc'::text,
    exists(select 1 from pg_proc where proname = 'app_product_allergen_summary'),
    'Allergen summary RPC exists.'::text
  union all
  select 'product_source_harvest_policy'::text,
    exists(select 1 from public.app_nutrition_ai_resolution_policies where task_key = 'product_source_harvest'),
    'Product source harvest AI policy exists.'::text
  union all
  select 'ingredient_tree_policy'::text,
    exists(select 1 from public.app_nutrition_ai_resolution_policies where task_key = 'ingredient_tree_parse'),
    'Ingredient tree parse AI policy exists.'::text;
$$;

grant execute on function public.app_v2766_healthcheck() to anon;
grant execute on function public.app_v2766_healthcheck() to authenticated;


-- ============================================================
-- db/v27_67_nutrition_full_rebuild.sql
-- ============================================================

-- v27.67 Inside LOOP Nutrition full rebuild
--
-- Purpose:
-- This is a clean replacement layer for the broken patch chain.
-- It gives nutrition/product/recipe/card logging its own stable tables and RPCs.
--
-- Key rules:
-- 1) Products + ingredients can be shared database items.
-- 2) Recipes + takeaway/menu estimates are private to owner/household.
-- 3) Allergens are split into:
--      contains     = actual ingredient/source allergen
--      may_contain  = trace/cross-contamination warning
-- 4) Source refresh stores formal name, image, ingredient text, allergen text, nutrition text, price and retailer.
-- 5) Drinks require ml unless a known serving option supplies it.
--
-- Safe to run alongside prior app_* nutrition tables.
-- It does not drop your existing data.

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

-- ------------------------------------------------------------
-- Flexible household membership helper.
-- Avoids hard dependency on your current household table shape.
-- ------------------------------------------------------------
drop function if exists public.loop_user_is_household_member(uuid);
create or replace function public.loop_user_is_household_member(p_household_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_ok boolean := false;
begin
  if p_household_id is null or auth.uid() is null then
    return false;
  end if;

  if to_regclass('public.app_household_members') is not null then
    execute '
      select exists(
        select 1
        from public.app_household_members
        where household_id = $1
          and user_id = $2
          and coalesce(status, ''active'') in (''active'', ''accepted'')
      )'
    into v_ok
    using p_household_id, auth.uid();

    if v_ok then return true; end if;
  end if;

  if to_regclass('public.household_members') is not null then
    execute '
      select exists(
        select 1
        from public.household_members
        where household_id = $1
          and user_id = $2
          and coalesce(status, ''active'') in (''active'', ''accepted'')
      )'
    into v_ok
    using p_household_id, auth.uid();

    if v_ok then return true; end if;
  end if;

  return false;
end;
$$;

grant execute on function public.loop_user_is_household_member(uuid) to authenticated;

-- ------------------------------------------------------------
-- Cards: products, ingredients, recipes, takeaways
-- ------------------------------------------------------------
create table if not exists public.loop_nutrition_cards (
  id uuid primary key default gen_random_uuid(),
  card_kind text not null default 'product',
  visibility text not null default 'shared_database',
  product_type text not null default 'food',
  owner_user_id uuid references auth.users(id) on delete set null,
  household_id uuid,
  display_name text not null,
  formal_name text,
  brand_name text,
  variant_name text,
  source_url text,
  source_host text,
  main_image_url text,
  serving_label text,
  serving_ml numeric,
  serving_g numeric,
  prepared_volume_ml numeric,
  package_count integer,
  calories numeric,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  fibre_g numeric,
  sugar_g numeric,
  added_sugar_g numeric,
  saturated_fat_g numeric,
  salt_g numeric,
  sodium_mg numeric,
  caffeine_mg numeric,
  nutrition jsonb not null default '{}'::jsonb,
  dietary_flags text[] not null default array[]::text[],
  confidence integer not null default 50,
  score integer,
  status text not null default 'active',
  is_verified boolean not null default false,
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loop_nutrition_cards_kind_check check (card_kind in ('product','ingredient','recipe','takeaway')),
  constraint loop_nutrition_cards_visibility_check check (visibility in ('shared_database','household_private','user_private')),
  constraint loop_nutrition_cards_product_type_check check (product_type in ('drink','food','other')),
  constraint loop_nutrition_cards_confidence_check check (confidence between 0 and 100),
  constraint loop_nutrition_cards_score_check check (score is null or score between 0 and 100)
);

create index if not exists loop_nutrition_cards_search_idx
on public.loop_nutrition_cards
using gin (
  to_tsvector(
    'simple',
    coalesce(display_name,'') || ' ' ||
    coalesce(formal_name,'') || ' ' ||
    coalesce(brand_name,'') || ' ' ||
    coalesce(variant_name,'') || ' ' ||
    coalesce(source_url,'')
  )
);

create index if not exists loop_nutrition_cards_household_idx
on public.loop_nutrition_cards(household_id, card_kind);

create index if not exists loop_nutrition_cards_owner_idx
on public.loop_nutrition_cards(owner_user_id, card_kind);

drop trigger if exists loop_nutrition_cards_updated_at on public.loop_nutrition_cards;
create trigger loop_nutrition_cards_updated_at
before update on public.loop_nutrition_cards
for each row execute function public.loop_set_updated_at();

-- ------------------------------------------------------------
-- Serving options for known products / sizes
-- ------------------------------------------------------------
create table if not exists public.loop_nutrition_serving_options (
  id uuid primary key default gen_random_uuid(),
  card_id uuid references public.loop_nutrition_cards(id) on delete cascade,
  canonical_name text not null,
  serving_label text not null,
  serving_ml numeric,
  serving_g numeric,
  prepared_volume_ml numeric,
  package_count integer,
  is_default boolean not null default false,
  confidence integer not null default 50,
  requires_user_confirmation boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loop_nutrition_serving_options_confidence_check check (confidence between 0 and 100),
  constraint loop_nutrition_serving_options_size_check check (
    serving_ml is not null or serving_g is not null or prepared_volume_ml is not null
  )
);

create index if not exists loop_nutrition_serving_options_card_idx
on public.loop_nutrition_serving_options(card_id);

create index if not exists loop_nutrition_serving_options_name_idx
on public.loop_nutrition_serving_options(lower(canonical_name));

drop trigger if exists loop_nutrition_serving_options_updated_at on public.loop_nutrition_serving_options;
create trigger loop_nutrition_serving_options_updated_at
before update on public.loop_nutrition_serving_options
for each row execute function public.loop_set_updated_at();

-- ------------------------------------------------------------
-- Aliases for search/known products
-- ------------------------------------------------------------
create table if not exists public.loop_nutrition_product_aliases (
  id uuid primary key default gen_random_uuid(),
  alias text not null,
  alias_key text not null unique,
  canonical_name text not null,
  brand_name text,
  product_family text,
  confidence integer not null default 60,
  created_at timestamptz not null default now(),
  constraint loop_nutrition_product_aliases_confidence_check check (confidence between 0 and 100)
);

-- ------------------------------------------------------------
-- Ingredient tree
-- ------------------------------------------------------------
create table if not exists public.loop_nutrition_card_ingredients (
  id uuid primary key default gen_random_uuid(),
  card_id uuid references public.loop_nutrition_cards(id) on delete cascade,
  parent_id uuid references public.loop_nutrition_card_ingredients(id) on delete cascade,
  sort_order integer not null default 0,
  section_label text not null default 'Ingredients',
  ingredient_name text not null,
  quantity_text text,
  percentage numeric,
  raw_text text,
  info_mode text not null default 'raw_only',
  linked_card_id uuid references public.loop_nutrition_cards(id) on delete set null,
  confidence integer not null default 60,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loop_nutrition_card_ingredients_info_mode_check check (info_mode in ('raw_only','expand','link_to_product')),
  constraint loop_nutrition_card_ingredients_confidence_check check (confidence between 0 and 100)
);

create index if not exists loop_nutrition_card_ingredients_card_idx
on public.loop_nutrition_card_ingredients(card_id, parent_id, sort_order);

drop trigger if exists loop_nutrition_card_ingredients_updated_at on public.loop_nutrition_card_ingredients;
create trigger loop_nutrition_card_ingredients_updated_at
before update on public.loop_nutrition_card_ingredients
for each row execute function public.loop_set_updated_at();

-- ------------------------------------------------------------
-- Allergens, split between contains and may_contain
-- ------------------------------------------------------------
create table if not exists public.loop_nutrition_card_allergens (
  id uuid primary key default gen_random_uuid(),
  card_id uuid references public.loop_nutrition_cards(id) on delete cascade,
  allergen_key text not null,
  allergen_label text not null,
  presence text not null default 'unknown',
  evidence_text text,
  source_url text,
  confidence integer not null default 50,
  locked boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loop_nutrition_card_allergens_presence_check check (presence in ('contains','may_contain','not_present','unknown')),
  constraint loop_nutrition_card_allergens_confidence_check check (confidence between 0 and 100)
);

create unique index if not exists loop_nutrition_card_allergens_unique_idx
on public.loop_nutrition_card_allergens(card_id, lower(allergen_key), presence);

create index if not exists loop_nutrition_card_allergens_card_idx
on public.loop_nutrition_card_allergens(card_id);

drop trigger if exists loop_nutrition_card_allergens_updated_at on public.loop_nutrition_card_allergens;
create trigger loop_nutrition_card_allergens_updated_at
before update on public.loop_nutrition_card_allergens
for each row execute function public.loop_set_updated_at();

-- ------------------------------------------------------------
-- Source snapshots / price history
-- ------------------------------------------------------------
create table if not exists public.loop_nutrition_source_snapshots (
  id uuid primary key default gen_random_uuid(),
  card_id uuid references public.loop_nutrition_cards(id) on delete cascade,
  submitted_by uuid references auth.users(id) on delete set null,
  source_url text not null,
  source_host text,
  retailer_name text,
  formal_name text,
  main_image_url text,
  price_amount numeric,
  price_currency text default 'GBP',
  price_text text,
  ingredients_text text,
  allergens_text text,
  nutrition_text text,
  raw_payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  confidence integer not null default 50,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loop_nutrition_source_snapshots_status_check check (status in ('queued','processing','needs_review','applied','rejected','failed')),
  constraint loop_nutrition_source_snapshots_confidence_check check (confidence between 0 and 100)
);

create index if not exists loop_nutrition_source_snapshots_card_idx
on public.loop_nutrition_source_snapshots(card_id, created_at desc);

create index if not exists loop_nutrition_source_snapshots_status_idx
on public.loop_nutrition_source_snapshots(status, created_at desc);

drop trigger if exists loop_nutrition_source_snapshots_updated_at on public.loop_nutrition_source_snapshots;
create trigger loop_nutrition_source_snapshots_updated_at
before update on public.loop_nutrition_source_snapshots
for each row execute function public.loop_set_updated_at();

create table if not exists public.loop_nutrition_price_observations (
  id uuid primary key default gen_random_uuid(),
  card_id uuid references public.loop_nutrition_cards(id) on delete cascade,
  snapshot_id uuid references public.loop_nutrition_source_snapshots(id) on delete set null,
  retailer_name text,
  source_url text,
  price_amount numeric,
  price_currency text default 'GBP',
  price_text text,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists loop_nutrition_price_observations_card_idx
on public.loop_nutrition_price_observations(card_id, observed_at desc);

-- ------------------------------------------------------------
-- Food logs
-- ------------------------------------------------------------
create table if not exists public.loop_nutrition_food_logs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  card_id uuid references public.loop_nutrition_cards(id) on delete set null,
  display_name text not null,
  log_date date not null default current_date,
  time_eaten time without time zone,
  meal_slot text not null default 'meal',
  serving_multiplier numeric not null default 1,
  serving_mode text not null default 'each_person',
  drink_volume_ml numeric,
  nutrition_snapshot jsonb not null default '{}'::jsonb,
  notes text,
  image_url text,
  status text not null default 'logged',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loop_nutrition_food_logs_meal_slot_check check (meal_slot in ('breakfast','lunch','dinner','snack','drink','meal')),
  constraint loop_nutrition_food_logs_serving_mode_check check (serving_mode in ('each_person','split_shared')),
  constraint loop_nutrition_food_logs_status_check check (status in ('draft','logged','needs_review','deleted'))
);

create index if not exists loop_nutrition_food_logs_household_date_idx
on public.loop_nutrition_food_logs(household_id, log_date desc);

create index if not exists loop_nutrition_food_logs_created_by_idx
on public.loop_nutrition_food_logs(created_by, log_date desc);

drop trigger if exists loop_nutrition_food_logs_updated_at on public.loop_nutrition_food_logs;
create trigger loop_nutrition_food_logs_updated_at
before update on public.loop_nutrition_food_logs
for each row execute function public.loop_set_updated_at();

create table if not exists public.loop_nutrition_food_log_people (
  id uuid primary key default gen_random_uuid(),
  log_id uuid references public.loop_nutrition_food_logs(id) on delete cascade,
  person_id uuid not null,
  confirmation_status text not null default 'accepted',
  created_at timestamptz not null default now(),
  constraint loop_nutrition_food_log_people_status_check check (confirmation_status in ('accepted','pending','rejected'))
);

create unique index if not exists loop_nutrition_food_log_people_unique_idx
on public.loop_nutrition_food_log_people(log_id, person_id);

-- ------------------------------------------------------------
-- Nutrition notifications
-- ------------------------------------------------------------
create table if not exists public.loop_nutrition_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid references auth.users(id) on delete cascade,
  recipient_person_id uuid,
  actor_user_id uuid references auth.users(id) on delete set null,
  household_id uuid,
  notification_kind text not null,
  title text not null,
  body text,
  action_url text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'unread',
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint loop_nutrition_notifications_status_check check (status in ('unread','read','archived')),
  constraint loop_nutrition_notifications_kind_check check (notification_kind in ('food_logged_for_you','product_source_needs_review','product_correction_applied','handover_review'))
);

create index if not exists loop_nutrition_notifications_recipient_idx
on public.loop_nutrition_notifications(recipient_user_id, status, created_at desc);

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
alter table public.loop_nutrition_cards enable row level security;
alter table public.loop_nutrition_serving_options enable row level security;
alter table public.loop_nutrition_product_aliases enable row level security;
alter table public.loop_nutrition_card_ingredients enable row level security;
alter table public.loop_nutrition_card_allergens enable row level security;
alter table public.loop_nutrition_source_snapshots enable row level security;
alter table public.loop_nutrition_price_observations enable row level security;
alter table public.loop_nutrition_food_logs enable row level security;
alter table public.loop_nutrition_food_log_people enable row level security;
alter table public.loop_nutrition_notifications enable row level security;

drop policy if exists "cards readable by scope" on public.loop_nutrition_cards;
create policy "cards readable by scope" on public.loop_nutrition_cards
for select to authenticated
using (
  visibility = 'shared_database'
  or owner_user_id = auth.uid()
  or public.loop_user_is_household_member(household_id)
);

drop policy if exists "cards insert own" on public.loop_nutrition_cards;
create policy "cards insert own" on public.loop_nutrition_cards
for insert to authenticated
with check (
  owner_user_id = auth.uid()
  or owner_user_id is null
);

drop policy if exists "cards update owner or household" on public.loop_nutrition_cards;
create policy "cards update owner or household" on public.loop_nutrition_cards
for update to authenticated
using (
  owner_user_id = auth.uid()
  or public.loop_user_is_household_member(household_id)
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin','') = 'true'
)
with check (
  owner_user_id = auth.uid()
  or public.loop_user_is_household_member(household_id)
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin','') = 'true'
);

drop policy if exists "serving options readable" on public.loop_nutrition_serving_options;
create policy "serving options readable" on public.loop_nutrition_serving_options
for select to authenticated using (true);

drop policy if exists "aliases readable" on public.loop_nutrition_product_aliases;
create policy "aliases readable" on public.loop_nutrition_product_aliases
for select to authenticated using (true);

drop policy if exists "ingredients readable by card" on public.loop_nutrition_card_ingredients;
create policy "ingredients readable by card" on public.loop_nutrition_card_ingredients
for select to authenticated
using (
  exists (
    select 1 from public.loop_nutrition_cards c
    where c.id = card_id
      and (
        c.visibility = 'shared_database'
        or c.owner_user_id = auth.uid()
        or public.loop_user_is_household_member(c.household_id)
      )
  )
);

drop policy if exists "allergens readable by card" on public.loop_nutrition_card_allergens;
create policy "allergens readable by card" on public.loop_nutrition_card_allergens
for select to authenticated
using (
  exists (
    select 1 from public.loop_nutrition_cards c
    where c.id = card_id
      and (
        c.visibility = 'shared_database'
        or c.owner_user_id = auth.uid()
        or public.loop_user_is_household_member(c.household_id)
      )
  )
);

drop policy if exists "source snapshots readable by submitter or card" on public.loop_nutrition_source_snapshots;
create policy "source snapshots readable by submitter or card" on public.loop_nutrition_source_snapshots
for select to authenticated
using (
  submitted_by = auth.uid()
  or exists (
    select 1 from public.loop_nutrition_cards c
    where c.id = card_id
      and (
        c.visibility = 'shared_database'
        or c.owner_user_id = auth.uid()
        or public.loop_user_is_household_member(c.household_id)
      )
  )
);

drop policy if exists "source snapshots insert own" on public.loop_nutrition_source_snapshots;
create policy "source snapshots insert own" on public.loop_nutrition_source_snapshots
for insert to authenticated
with check (submitted_by = auth.uid());

drop policy if exists "price observations readable by card" on public.loop_nutrition_price_observations;
create policy "price observations readable by card" on public.loop_nutrition_price_observations
for select to authenticated
using (
  exists (
    select 1 from public.loop_nutrition_cards c
    where c.id = card_id
      and (
        c.visibility = 'shared_database'
        or c.owner_user_id = auth.uid()
        or public.loop_user_is_household_member(c.household_id)
      )
  )
);

drop policy if exists "food logs readable" on public.loop_nutrition_food_logs;
create policy "food logs readable" on public.loop_nutrition_food_logs
for select to authenticated
using (
  created_by = auth.uid()
  or public.loop_user_is_household_member(household_id)
);

drop policy if exists "food logs insert own" on public.loop_nutrition_food_logs;
create policy "food logs insert own" on public.loop_nutrition_food_logs
for insert to authenticated
with check (created_by = auth.uid());

drop policy if exists "food logs update own or household" on public.loop_nutrition_food_logs;
create policy "food logs update own or household" on public.loop_nutrition_food_logs
for update to authenticated
using (created_by = auth.uid() or public.loop_user_is_household_member(household_id))
with check (created_by = auth.uid() or public.loop_user_is_household_member(household_id));

drop policy if exists "food log people readable through log" on public.loop_nutrition_food_log_people;
create policy "food log people readable through log" on public.loop_nutrition_food_log_people
for select to authenticated
using (
  exists (
    select 1 from public.loop_nutrition_food_logs l
    where l.id = log_id
      and (l.created_by = auth.uid() or public.loop_user_is_household_member(l.household_id))
  )
);

drop policy if exists "notifications recipient read" on public.loop_nutrition_notifications;
create policy "notifications recipient read" on public.loop_nutrition_notifications
for select to authenticated using (recipient_user_id = auth.uid());

-- writes for child tables through RPC/service/admin actions
drop policy if exists "nutrition admin all serving" on public.loop_nutrition_serving_options;
create policy "nutrition admin all serving" on public.loop_nutrition_serving_options
for all to authenticated
using (coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin','') = 'true')
with check (coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin','') = 'true');

drop policy if exists "nutrition admin all aliases" on public.loop_nutrition_product_aliases;
create policy "nutrition admin all aliases" on public.loop_nutrition_product_aliases
for all to authenticated
using (coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin','') = 'true')
with check (coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin','') = 'true');

-- ------------------------------------------------------------
-- URL host + display helpers
-- ------------------------------------------------------------
drop function if exists public.loop_url_host(text);
create or replace function public.loop_url_host(p_url text)
returns text
language plpgsql
immutable
set search_path = public, pg_catalog
as $$
declare
  v_host text;
begin
  begin
    v_host := lower(regexp_replace(coalesce(p_url,''), '^https?://([^/?#]+).*$','\1'));
  exception when others then
    return null;
  end;

  v_host := regexp_replace(v_host, '^www\.', '');
  if v_host = coalesce(p_url,'') or v_host = '' then
    return null;
  end if;
  return v_host;
end;
$$;

grant execute on function public.loop_url_host(text) to authenticated;

drop function if exists public.loop_food_display_name_with_size(text, numeric, numeric, numeric);
create or replace function public.loop_food_display_name_with_size(
  p_name text,
  p_prepared_volume_ml numeric default null,
  p_serving_ml numeric default null,
  p_serving_g numeric default null
)
returns text
language plpgsql
immutable
set search_path = public, pg_catalog
as $$
declare
  v_name text := trim(coalesce(p_name, 'Food / drink'));
  v_ml numeric := coalesce(p_prepared_volume_ml, p_serving_ml);
begin
  if v_ml is not null and position('ml' in lower(v_name)) = 0 then
    return v_name || ' (' || trim(to_char(v_ml, 'FM999999990.##')) || 'ml)';
  end if;

  if v_ml is null and p_serving_g is not null and position('g' in lower(v_name)) = 0 then
    return v_name || ' (' || trim(to_char(p_serving_g, 'FM999999990.##')) || 'g)';
  end if;

  return v_name;
end;
$$;

grant execute on function public.loop_food_display_name_with_size(text, numeric, numeric, numeric) to authenticated;

-- ------------------------------------------------------------
-- Search cards
-- ------------------------------------------------------------
drop function if exists public.loop_nutrition_search_cards(text, uuid, integer);
create or replace function public.loop_nutrition_search_cards(
  p_query text default '',
  p_household_id uuid default null,
  p_limit integer default 12
)
returns table (
  id uuid,
  card_kind text,
  visibility text,
  product_type text,
  display_name text,
  brand_name text,
  formal_name text,
  main_image_url text,
  serving_label text,
  serving_ml numeric,
  serving_g numeric,
  prepared_volume_ml numeric,
  calories numeric,
  protein_g numeric,
  carbs_g numeric,
  fibre_g numeric,
  salt_g numeric,
  caffeine_mg numeric,
  confidence integer,
  score integer
)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select
    c.id,
    c.card_kind,
    c.visibility,
    c.product_type,
    public.loop_food_display_name_with_size(c.display_name, c.prepared_volume_ml, c.serving_ml, c.serving_g) as display_name,
    c.brand_name,
    c.formal_name,
    c.main_image_url,
    c.serving_label,
    c.serving_ml,
    c.serving_g,
    c.prepared_volume_ml,
    c.calories,
    c.protein_g,
    c.carbs_g,
    c.fibre_g,
    c.salt_g,
    c.caffeine_mg,
    c.confidence,
    c.score
  from public.loop_nutrition_cards c
  where c.status = 'active'
    and (
      c.visibility = 'shared_database'
      or c.owner_user_id = auth.uid()
      or public.loop_user_is_household_member(c.household_id)
    )
    and (
      coalesce(trim(p_query), '') = ''
      or lower(c.display_name) like '%' || lower(trim(p_query)) || '%'
      or lower(coalesce(c.formal_name,'')) like '%' || lower(trim(p_query)) || '%'
      or lower(coalesce(c.brand_name,'')) like '%' || lower(trim(p_query)) || '%'
      or lower(coalesce(c.source_url,'')) like '%' || lower(trim(p_query)) || '%'
    )
    and (
      p_household_id is null
      or c.visibility = 'shared_database'
      or c.household_id = p_household_id
    )
  order by
    case when lower(c.display_name) = lower(trim(p_query)) then 0 else 1 end,
    c.confidence desc,
    c.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 12), 50));
$$;

grant execute on function public.loop_nutrition_search_cards(text, uuid, integer) to authenticated;

-- ------------------------------------------------------------
-- Serving lookup
-- ------------------------------------------------------------
drop function if exists public.loop_nutrition_serving_options_for_query(text, uuid);
create or replace function public.loop_nutrition_serving_options_for_query(
  p_query text,
  p_card_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_query text := lower(trim(coalesce(p_query, '')));
  v_canonical text;
  v_result jsonb;
begin
  select a.canonical_name
  into v_canonical
  from public.loop_nutrition_product_aliases a
  where a.alias_key = v_query
     or v_query like '%' || a.alias_key || '%'
     or a.alias_key like '%' || v_query || '%'
  order by a.confidence desc
  limit 1;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', o.id,
      'card_id', o.card_id,
      'canonical_name', o.canonical_name,
      'serving_label', o.serving_label,
      'serving_ml', o.serving_ml,
      'serving_g', o.serving_g,
      'prepared_volume_ml', o.prepared_volume_ml,
      'package_count', o.package_count,
      'is_default', o.is_default,
      'confidence', o.confidence,
      'requires_user_confirmation', o.requires_user_confirmation,
      'display_name', public.loop_food_display_name_with_size(o.canonical_name, o.prepared_volume_ml, o.serving_ml, o.serving_g)
    )
    order by o.is_default desc, coalesce(o.prepared_volume_ml, o.serving_ml, 0), coalesce(o.serving_g, 0)
  ), '[]'::jsonb)
  into v_result
  from public.loop_nutrition_serving_options o
  where (p_card_id is not null and o.card_id = p_card_id)
     or (v_canonical is not null and lower(o.canonical_name) = lower(v_canonical))
     or (v_canonical is null and lower(o.canonical_name) like '%' || v_query || '%');

  return jsonb_build_object(
    'query', p_query,
    'canonical_name', v_canonical,
    'options', v_result
  );
end;
$$;

grant execute on function public.loop_nutrition_serving_options_for_query(text, uuid) to authenticated;

drop function if exists public.loop_nutrition_drink_volume_required(text, text, numeric, uuid);
create or replace function public.loop_nutrition_drink_volume_required(
  p_meal_slot text,
  p_product_type text,
  p_volume_ml numeric default null,
  p_serving_option_id uuid default null
)
returns jsonb
language plpgsql
stable
set search_path = public, pg_catalog
as $$
declare
  v_is_drink boolean := lower(coalesce(p_meal_slot, '')) = 'drink'
    or lower(coalesce(p_product_type, '')) = 'drink';
  v_known_ml numeric;
begin
  if p_serving_option_id is not null then
    select coalesce(prepared_volume_ml, serving_ml)
    into v_known_ml
    from public.loop_nutrition_serving_options
    where id = p_serving_option_id;
  end if;

  return jsonb_build_object(
    'is_drink', v_is_drink,
    'volume_required', v_is_drink and coalesce(p_volume_ml, v_known_ml) is null,
    'effective_volume_ml', coalesce(p_volume_ml, v_known_ml),
    'message', case
      when v_is_drink and coalesce(p_volume_ml, v_known_ml) is null
        then 'Drink volume is required so hydration and timing context are accurate.'
      else null
    end
  );
end;
$$;

grant execute on function public.loop_nutrition_drink_volume_required(text, text, numeric, uuid) to authenticated;

-- ------------------------------------------------------------
-- Queue source refresh
-- ------------------------------------------------------------
drop function if exists public.loop_nutrition_queue_source_refresh(uuid, text, text);
create or replace function public.loop_nutrition_queue_source_refresh(
  p_card_id uuid,
  p_source_url text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.';
  end if;

  if trim(coalesce(p_source_url, '')) = '' then
    raise exception 'Source URL is required.';
  end if;

  insert into public.loop_nutrition_source_snapshots(
    card_id,
    submitted_by,
    source_url,
    source_host,
    raw_payload,
    status
  )
  values (
    p_card_id,
    auth.uid(),
    p_source_url,
    public.loop_url_host(p_source_url),
    jsonb_build_object('note', p_note),
    'queued'
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'snapshot_id', v_id,
    'message', 'Source refresh queued.'
  );
end;
$$;

grant execute on function public.loop_nutrition_queue_source_refresh(uuid, text, text) to authenticated;

-- ------------------------------------------------------------
-- Split allergen summary
-- ------------------------------------------------------------
drop function if exists public.loop_nutrition_allergen_summary(uuid);
create or replace function public.loop_nutrition_allergen_summary(p_card_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select jsonb_build_object(
    'contains', coalesce(jsonb_agg(jsonb_build_object('key', allergen_key, 'label', allergen_label, 'evidence', evidence_text, 'confidence', confidence)) filter (where presence = 'contains'), '[]'::jsonb),
    'may_contain', coalesce(jsonb_agg(jsonb_build_object('key', allergen_key, 'label', allergen_label, 'evidence', evidence_text, 'confidence', confidence)) filter (where presence = 'may_contain'), '[]'::jsonb),
    'unknown', coalesce(jsonb_agg(jsonb_build_object('key', allergen_key, 'label', allergen_label)) filter (where presence = 'unknown'), '[]'::jsonb)
  )
  from public.loop_nutrition_card_allergens
  where card_id = p_card_id;
$$;

grant execute on function public.loop_nutrition_allergen_summary(uuid) to authenticated;

-- ------------------------------------------------------------
-- Starter seed cards/options
-- ------------------------------------------------------------
insert into public.loop_nutrition_product_aliases(alias, alias_key, canonical_name, brand_name, product_family, confidence)
values
('red bull sugarfree', lower('red bull sugarfree'), 'Red Bull Sugarfree', 'Red Bull', 'Energy drink', 95),
('red bull sugar free', lower('red bull sugar free'), 'Red Bull Sugarfree', 'Red Bull', 'Energy drink', 95),
('redbull sugarfree', lower('redbull sugarfree'), 'Red Bull Sugarfree', 'Red Bull', 'Energy drink', 95),
('gfuel hype sauce', lower('gfuel hype sauce'), 'GFuel Hype Sauce 2.0', 'G FUEL', 'Powdered energy drink', 90),
('g fuel hype sauce', lower('g fuel hype sauce'), 'GFuel Hype Sauce 2.0', 'G FUEL', 'Powdered energy drink', 90)
on conflict (alias_key) do update set
  canonical_name = excluded.canonical_name,
  brand_name = excluded.brand_name,
  product_family = excluded.product_family,
  confidence = excluded.confidence;

with card_seed as (
  select *
  from (
    values
      ('Red Bull Sugarfree'::text, 'Red Bull'::text, 'drink'::text, '250ml can'::text, 250::numeric, null::numeric, 250::numeric, 8::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric, 80::numeric, 90::integer),
      ('GFuel Hype Sauce 2.0'::text, 'G FUEL'::text, 'drink'::text, '1 scoop / 500ml prepared drink'::text, null::numeric, 6.2::numeric, 500::numeric, 5::numeric, 0::numeric, 2::numeric, 0::numeric, 0::numeric, 0::numeric, 0.2::numeric, 140::numeric, 92::integer)
  ) as v(display_name, brand_name, product_type, serving_label, serving_ml, serving_g, prepared_volume_ml, calories, protein_g, carbs_g, fat_g, fibre_g, sugar_g, salt_g, caffeine_mg, confidence)
)
insert into public.loop_nutrition_cards(
  card_kind, visibility, product_type, display_name, formal_name, brand_name, serving_label, serving_ml, serving_g, prepared_volume_ml,
  calories, protein_g, carbs_g, fat_g, fibre_g, sugar_g, salt_g, caffeine_mg, confidence, is_verified
)
select
  'product', 'shared_database', s.product_type, s.display_name, s.display_name, s.brand_name, s.serving_label, s.serving_ml, s.serving_g, s.prepared_volume_ml,
  s.calories, s.protein_g, s.carbs_g, s.fat_g, s.fibre_g, s.sugar_g, s.salt_g, s.caffeine_mg, s.confidence, false
from card_seed s
where not exists (
  select 1 from public.loop_nutrition_cards c
  where lower(c.display_name) = lower(s.display_name)
    and c.card_kind = 'product'
);

insert into public.loop_nutrition_serving_options(card_id, canonical_name, serving_label, serving_ml, serving_g, prepared_volume_ml, package_count, is_default, confidence, requires_user_confirmation)
select c.id, c.display_name, c.serving_label, c.serving_ml, c.serving_g, c.prepared_volume_ml, 1, true, c.confidence, false
from public.loop_nutrition_cards c
where lower(c.display_name) in ('red bull sugarfree', 'gfuel hype sauce 2.0')
  and not exists (
    select 1 from public.loop_nutrition_serving_options o
    where o.card_id = c.id and lower(o.serving_label) = lower(c.serving_label)
  );

insert into public.loop_nutrition_serving_options(canonical_name, serving_label, serving_ml, prepared_volume_ml, package_count, is_default, confidence, requires_user_confirmation)
select 'Red Bull Sugarfree', '355ml can', 355, 355, 1, false, 80, true
where not exists (select 1 from public.loop_nutrition_serving_options where lower(canonical_name) = 'red bull sugarfree' and serving_ml = 355);

insert into public.loop_nutrition_serving_options(canonical_name, serving_label, serving_ml, prepared_volume_ml, package_count, is_default, confidence, requires_user_confirmation)
select 'Red Bull Sugarfree', '473ml can', 473, 473, 1, false, 75, true
where not exists (select 1 from public.loop_nutrition_serving_options where lower(canonical_name) = 'red bull sugarfree' and serving_ml = 473);

-- ------------------------------------------------------------
-- Healthcheck
-- ------------------------------------------------------------
drop function if exists public.loop_v2767_nutrition_healthcheck();
create or replace function public.loop_v2767_nutrition_healthcheck()
returns table(check_name text, ok boolean, detail text)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select 'cards_table'::text, to_regclass('public.loop_nutrition_cards') is not null, 'Nutrition cards table exists.'
  union all
  select 'serving_options_table', to_regclass('public.loop_nutrition_serving_options') is not null, 'Serving options table exists.'
  union all
  select 'ingredient_tree_table', to_regclass('public.loop_nutrition_card_ingredients') is not null, 'Ingredient tree table exists.'
  union all
  select 'allergen_split_table', to_regclass('public.loop_nutrition_card_allergens') is not null, 'Allergen split table exists.'
  union all
  select 'source_snapshots_table', to_regclass('public.loop_nutrition_source_snapshots') is not null, 'Source snapshots table exists.'
  union all
  select 'food_logs_table', to_regclass('public.loop_nutrition_food_logs') is not null, 'Food logs table exists.'
  union all
  select 'search_rpc', exists(select 1 from pg_proc where proname = 'loop_nutrition_search_cards'), 'Search RPC exists.'
  union all
  select 'serving_rpc', exists(select 1 from pg_proc where proname = 'loop_nutrition_serving_options_for_query'), 'Serving lookup RPC exists.'
  union all
  select 'source_refresh_rpc', exists(select 1 from pg_proc where proname = 'loop_nutrition_queue_source_refresh'), 'Source refresh RPC exists.'
  union all
  select 'red_bull_seed', exists(select 1 from public.loop_nutrition_cards where lower(display_name) = 'red bull sugarfree'), 'Red Bull starter card exists.'
  union all
  select 'gfuel_seed', exists(select 1 from public.loop_nutrition_cards where lower(display_name) = 'gfuel hype sauce 2.0'), 'GFuel starter card exists.';
$$;

grant execute on function public.loop_v2767_nutrition_healthcheck() to anon;
grant execute on function public.loop_v2767_nutrition_healthcheck() to authenticated;


-- ============================================================
-- db/v27_69_product_import_ai_enrichment.sql
-- ============================================================

-- v27.69 LOOP product import + AI enrichment queue
-- Adds a safe staging layer for CSV/Excel-style product imports.
-- Products/ingredients can become shared library items; recipes/takeaways remain private elsewhere.

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

-- Keep this migration usable even if v27.67 has not been run yet.
create table if not exists public.loop_nutrition_cards (
  id uuid primary key default gen_random_uuid(),
  card_kind text not null default 'product',
  visibility text not null default 'shared_database',
  product_type text not null default 'food',
  owner_user_id uuid references auth.users(id) on delete set null,
  household_id uuid,
  display_name text not null,
  formal_name text,
  brand_name text,
  variant_name text,
  source_url text,
  source_host text,
  main_image_url text,
  serving_label text,
  serving_ml numeric,
  serving_g numeric,
  prepared_volume_ml numeric,
  package_count integer,
  calories numeric,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  fibre_g numeric,
  sugar_g numeric,
  added_sugar_g numeric,
  saturated_fat_g numeric,
  salt_g numeric,
  sodium_mg numeric,
  caffeine_mg numeric,
  nutrition jsonb not null default '{}'::jsonb,
  dietary_flags text[] not null default array[]::text[],
  confidence integer not null default 50,
  score integer,
  status text not null default 'active',
  is_verified boolean not null default false,
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.loop_nutrition_cards
  add column if not exists barcode text,
  add column if not exists category text,
  add column if not exists import_batch_id uuid,
  add column if not exists import_row_id uuid,
  add column if not exists enrichment_status text not null default 'not_requested',
  add column if not exists enrichment_note text,
  add column if not exists last_enriched_at timestamptz,
  add column if not exists data_quality_status text not null default 'draft';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'loop_nutrition_cards_enrichment_status_check'
  ) then
    alter table public.loop_nutrition_cards
      add constraint loop_nutrition_cards_enrichment_status_check
      check (enrichment_status in ('not_requested','queued','processing','ai_enriched','needs_review','verified','failed'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'loop_nutrition_cards_data_quality_status_check'
  ) then
    alter table public.loop_nutrition_cards
      add constraint loop_nutrition_cards_data_quality_status_check
      check (data_quality_status in ('draft','imported','estimated','needs_review','verified','conflict'));
  end if;
end $$;

create index if not exists loop_nutrition_cards_barcode_idx on public.loop_nutrition_cards(lower(barcode)) where barcode is not null;
create index if not exists loop_nutrition_cards_brand_name_idx on public.loop_nutrition_cards(lower(coalesce(brand_name,'')), lower(display_name));
create index if not exists loop_nutrition_cards_category_idx on public.loop_nutrition_cards(category, product_type);

-- Generic facts allow calories/macros/micros/source confidence to be tracked without changing schema every time.
create table if not exists public.loop_nutrition_card_facts (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.loop_nutrition_cards(id) on delete cascade,
  fact_key text not null,
  fact_label text,
  value_numeric numeric,
  value_text text,
  unit text,
  source_kind text not null default 'import',
  source_url text,
  source_batch_id uuid,
  source_row_id uuid,
  confidence integer not null default 50,
  is_estimated boolean not null default false,
  is_verified boolean not null default false,
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loop_nutrition_card_facts_source_kind_check check (source_kind in ('import','ai_estimate','source_url','label_image','admin','user_correction')),
  constraint loop_nutrition_card_facts_confidence_check check (confidence between 0 and 100)
);

create unique index if not exists loop_nutrition_card_facts_unique_key
  on public.loop_nutrition_card_facts(card_id, fact_key);

create index if not exists loop_nutrition_card_facts_review_idx
  on public.loop_nutrition_card_facts(is_estimated, is_verified, confidence);


create table if not exists public.loop_nutrition_card_ingredients (
  id uuid primary key default gen_random_uuid(),
  card_id uuid references public.loop_nutrition_cards(id) on delete cascade,
  parent_id uuid references public.loop_nutrition_card_ingredients(id) on delete cascade,
  sort_order integer not null default 0,
  section_label text not null default 'Ingredients',
  ingredient_name text not null,
  quantity_text text,
  percentage numeric,
  raw_text text,
  info_mode text not null default 'raw_only',
  linked_card_id uuid references public.loop_nutrition_cards(id) on delete set null,
  confidence integer not null default 60,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists loop_nutrition_card_ingredients_card_idx
  on public.loop_nutrition_card_ingredients(card_id, parent_id, sort_order);

create table if not exists public.loop_nutrition_card_allergens (
  id uuid primary key default gen_random_uuid(),
  card_id uuid references public.loop_nutrition_cards(id) on delete cascade,
  allergen_key text not null,
  allergen_label text not null,
  presence text not null default 'unknown',
  evidence_text text,
  source_url text,
  confidence integer not null default 50,
  locked boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists loop_nutrition_card_allergens_unique_idx
  on public.loop_nutrition_card_allergens(card_id, lower(allergen_key), presence);

create table if not exists public.loop_nutrition_price_observations (
  id uuid primary key default gen_random_uuid(),
  card_id uuid references public.loop_nutrition_cards(id) on delete cascade,
  retailer_name text,
  source_url text,
  price_amount numeric,
  price_currency text default 'GBP',
  price_text text,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists loop_nutrition_price_observations_card_idx
  on public.loop_nutrition_price_observations(card_id, observed_at desc);

drop trigger if exists loop_nutrition_card_facts_updated_at on public.loop_nutrition_card_facts;
create trigger loop_nutrition_card_facts_updated_at
before update on public.loop_nutrition_card_facts
for each row execute function public.loop_set_updated_at();

create table if not exists public.loop_product_import_batches (
  id uuid primary key default gen_random_uuid(),
  uploaded_by uuid references auth.users(id) on delete set null,
  file_name text,
  import_name text,
  status text not null default 'uploaded',
  total_rows integer not null default 0,
  created_count integer not null default 0,
  updated_count integer not null default 0,
  matched_count integer not null default 0,
  needs_review_count integer not null default 0,
  failed_count integer not null default 0,
  source_type text not null default 'csv',
  default_visibility text not null default 'shared_database',
  default_currency text not null default 'GBP',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loop_product_import_batches_status_check check (status in ('uploaded','mapping','staged','matching','matched','enriching','ai_enriched','applying','applied','needs_review','failed')),
  constraint loop_product_import_batches_visibility_check check (default_visibility in ('shared_database','household_private','user_private'))
);

drop trigger if exists loop_product_import_batches_updated_at on public.loop_product_import_batches;
create trigger loop_product_import_batches_updated_at
before update on public.loop_product_import_batches
for each row execute function public.loop_set_updated_at();

create table if not exists public.loop_product_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.loop_product_import_batches(id) on delete cascade,
  row_number integer not null,
  status text not null default 'new',
  raw_row jsonb not null default '{}'::jsonb,
  normalised jsonb not null default '{}'::jsonb,
  enriched jsonb not null default '{}'::jsonb,
  existing_card_id uuid references public.loop_nutrition_cards(id) on delete set null,
  match_strategy text,
  match_confidence integer not null default 0,
  conflict_fields text[] not null default array[]::text[],
  warnings text[] not null default array[]::text[],
  error_message text,
  product_name text,
  brand text,
  product_type text,
  category text,
  barcode text,
  source_url text,
  image_url text,
  retailer text,
  price_amount numeric,
  price_currency text default 'GBP',
  created_card_id uuid references public.loop_nutrition_cards(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loop_product_import_rows_status_check check (status in ('new','matched_existing','needs_review','ready_to_create','created','updated','ai_queued','ai_enriching','ai_enriched','skipped','failed')),
  constraint loop_product_import_rows_match_confidence_check check (match_confidence between 0 and 100)
);

create unique index if not exists loop_product_import_rows_batch_row_unique
  on public.loop_product_import_rows(batch_id, row_number);
create index if not exists loop_product_import_rows_batch_status_idx on public.loop_product_import_rows(batch_id, status);
create index if not exists loop_product_import_rows_match_idx on public.loop_product_import_rows(existing_card_id, match_confidence);
create index if not exists loop_product_import_rows_barcode_idx on public.loop_product_import_rows(lower(barcode)) where barcode is not null;

drop trigger if exists loop_product_import_rows_updated_at on public.loop_product_import_rows;
create trigger loop_product_import_rows_updated_at
before update on public.loop_product_import_rows
for each row execute function public.loop_set_updated_at();

create table if not exists public.loop_product_import_enrichment_jobs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.loop_product_import_batches(id) on delete cascade,
  row_id uuid references public.loop_product_import_rows(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  job_kind text not null default 'ai_product_enrichment',
  status text not null default 'queued',
  provider text,
  model text,
  prompt_version text not null default 'v27.69-product-enrichment',
  input_payload jsonb not null default '{}'::jsonb,
  output_payload jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loop_product_import_enrichment_jobs_status_check check (status in ('queued','processing','completed','failed','skipped'))
);

create index if not exists loop_product_import_enrichment_jobs_batch_idx on public.loop_product_import_enrichment_jobs(batch_id, status, created_at desc);

drop trigger if exists loop_product_import_enrichment_jobs_updated_at on public.loop_product_import_enrichment_jobs;
create trigger loop_product_import_enrichment_jobs_updated_at
before update on public.loop_product_import_enrichment_jobs
for each row execute function public.loop_set_updated_at();

-- RLS. App admin actions use service-role where configured; authenticated can read shared cards/facts.
alter table public.loop_nutrition_cards enable row level security;
alter table public.loop_nutrition_card_facts enable row level security;
alter table public.loop_product_import_batches enable row level security;
alter table public.loop_product_import_rows enable row level security;
alter table public.loop_product_import_enrichment_jobs enable row level security;

drop policy if exists "nutrition cards shared readable" on public.loop_nutrition_cards;
create policy "nutrition cards shared readable" on public.loop_nutrition_cards
for select to authenticated using (visibility = 'shared_database' or owner_user_id = auth.uid());

drop policy if exists "nutrition facts shared readable" on public.loop_nutrition_card_facts;
create policy "nutrition facts shared readable" on public.loop_nutrition_card_facts
for select to authenticated using (
  exists (
    select 1 from public.loop_nutrition_cards c
    where c.id = card_id and (c.visibility = 'shared_database' or c.owner_user_id = auth.uid())
  )
);

-- Helpful normalisation helpers.
drop function if exists public.loop_product_import_key(text);
create or replace function public.loop_product_import_key(p_value text)
returns text
language sql
immutable
set search_path = public, pg_catalog
as $$
  select nullif(regexp_replace(lower(trim(coalesce(p_value,''))), '[^a-z0-9]+', ' ', 'g'), '')
$$;

grant execute on function public.loop_product_import_key(text) to authenticated;

drop function if exists public.loop_product_import_recount(uuid);
create or replace function public.loop_product_import_recount(p_batch_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  update public.loop_product_import_batches b
  set
    total_rows = coalesce((select count(*) from public.loop_product_import_rows r where r.batch_id = p_batch_id),0),
    matched_count = coalesce((select count(*) from public.loop_product_import_rows r where r.batch_id = p_batch_id and r.status = 'matched_existing'),0),
    needs_review_count = coalesce((select count(*) from public.loop_product_import_rows r where r.batch_id = p_batch_id and r.status = 'needs_review'),0),
    created_count = coalesce((select count(*) from public.loop_product_import_rows r where r.batch_id = p_batch_id and r.status = 'created'),0),
    updated_count = coalesce((select count(*) from public.loop_product_import_rows r where r.batch_id = p_batch_id and r.status = 'updated'),0),
    failed_count = coalesce((select count(*) from public.loop_product_import_rows r where r.batch_id = p_batch_id and r.status = 'failed'),0),
    updated_at = now()
  where b.id = p_batch_id;
end;
$$;

grant execute on function public.loop_product_import_recount(uuid) to authenticated;

-- Finds likely card matches for a staged row.
drop function if exists public.loop_product_import_match_row(uuid);
create or replace function public.loop_product_import_match_row(p_row_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_row public.loop_product_import_rows%rowtype;
  v_match_id uuid;
  v_strategy text;
  v_confidence integer := 0;
  v_name_key text;
  v_brand_key text;
begin
  select * into v_row from public.loop_product_import_rows where id = p_row_id;
  if not found then
    raise exception 'Import row not found.';
  end if;

  v_name_key := public.loop_product_import_key(v_row.product_name);
  v_brand_key := public.loop_product_import_key(v_row.brand);

  if nullif(v_row.barcode,'') is not null then
    select id into v_match_id
    from public.loop_nutrition_cards
    where lower(coalesce(barcode,'')) = lower(v_row.barcode)
    order by updated_at desc
    limit 1;
    if v_match_id is not null then
      v_strategy := 'barcode_exact';
      v_confidence := 100;
    end if;
  end if;

  if v_match_id is null and nullif(v_row.source_url,'') is not null then
    select id into v_match_id
    from public.loop_nutrition_cards
    where lower(coalesce(source_url,'')) = lower(v_row.source_url)
    order by updated_at desc
    limit 1;
    if v_match_id is not null then
      v_strategy := 'source_url_exact';
      v_confidence := 96;
    end if;
  end if;

  if v_match_id is null and v_name_key is not null then
    select id into v_match_id
    from public.loop_nutrition_cards c
    where public.loop_product_import_key(c.display_name) = v_name_key
      and (v_brand_key is null or public.loop_product_import_key(c.brand_name) = v_brand_key)
    order by case when public.loop_product_import_key(c.brand_name) = v_brand_key then 0 else 1 end, updated_at desc
    limit 1;
    if v_match_id is not null then
      v_strategy := 'brand_name_exact';
      v_confidence := case when v_brand_key is not null then 90 else 78 end;
    end if;
  end if;

  update public.loop_product_import_rows
  set
    existing_card_id = v_match_id,
    match_strategy = v_strategy,
    match_confidence = v_confidence,
    status = case
      when v_match_id is not null and v_confidence >= 90 then 'matched_existing'
      when v_match_id is not null then 'needs_review'
      else 'ready_to_create'
    end,
    warnings = case
      when v_match_id is not null and v_confidence < 90 then array_append(warnings, 'Possible existing product match. Review before applying.')
      else warnings
    end
  where id = p_row_id;

  perform public.loop_product_import_recount(v_row.batch_id);

  return jsonb_build_object(
    'row_id', p_row_id,
    'existing_card_id', v_match_id,
    'match_strategy', v_strategy,
    'match_confidence', v_confidence
  );
end;
$$;

grant execute on function public.loop_product_import_match_row(uuid) to authenticated;

drop function if exists public.loop_v2769_product_import_healthcheck();
create or replace function public.loop_v2769_product_import_healthcheck()
returns table(check_name text, ok boolean, detail text)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select 'import_batches_table', to_regclass('public.loop_product_import_batches') is not null, 'Product import batches table exists.'
  union all
  select 'import_rows_table', to_regclass('public.loop_product_import_rows') is not null, 'Product import rows table exists.'
  union all
  select 'enrichment_jobs_table', to_regclass('public.loop_product_import_enrichment_jobs') is not null, 'Product enrichment jobs table exists.'
  union all
  select 'card_facts_table', to_regclass('public.loop_nutrition_card_facts') is not null, 'Nutrition card facts table exists.'
  union all
  select 'match_rpc', exists(select 1 from pg_proc where proname = 'loop_product_import_match_row'), 'Row matching RPC exists.'
  union all
  select 'recount_rpc', exists(select 1 from pg_proc where proname = 'loop_product_import_recount'), 'Batch recount RPC exists.';
$$;

grant execute on function public.loop_v2769_product_import_healthcheck() to anon;
grant execute on function public.loop_v2769_product_import_healthcheck() to authenticated;


-- ============================================================
-- db/v27_70_product_import_price_shopping.sql
-- ============================================================

-- v27.70 LOOP product import package + price refresh + shopping list planning
-- Run after v27.69. Safe to run repeatedly.

create extension if not exists pgcrypto;

-- Product library metadata needed by Aldi/Lidl/Tesco import packages.
alter table public.loop_nutrition_cards
  add column if not exists shop_tag text,
  add column if not exists retailer_article_number text,
  add column if not exists dedupe_key text,
  add column if not exists image_harvest_mode text,
  add column if not exists image_alt text,
  add column if not exists product_size_text text,
  add column if not exists price_refresh_status text not null default 'not_requested',
  add column if not exists last_price_checked_at timestamptz,
  add column if not exists last_price_status text,
  add column if not exists last_price_error text;

create index if not exists loop_nutrition_cards_shop_article_idx
  on public.loop_nutrition_cards(shop_tag, retailer_article_number)
  where shop_tag is not null and retailer_article_number is not null;

create index if not exists loop_nutrition_cards_dedupe_key_idx
  on public.loop_nutrition_cards(lower(dedupe_key))
  where dedupe_key is not null and dedupe_key <> '';

-- Extra import row fields for multi-file package imports.
alter table public.loop_product_import_rows
  add column if not exists import_key text,
  add column if not exists shop_tag text,
  add column if not exists retailer_article_number text,
  add column if not exists dedupe_key text,
  add column if not exists supporting_payload jsonb not null default '{}'::jsonb,
  add column if not exists source_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists serving_options jsonb not null default '[]'::jsonb,
  add column if not exists source_allergens jsonb not null default '[]'::jsonb;

create index if not exists loop_product_import_rows_import_key_idx
  on public.loop_product_import_rows(batch_id, import_key);
create index if not exists loop_product_import_rows_shop_article_idx
  on public.loop_product_import_rows(shop_tag, retailer_article_number);


-- Serving options are needed to distinguish product variants/sizes.
create table if not exists public.loop_nutrition_serving_options (
  id uuid primary key default gen_random_uuid(),
  card_id uuid references public.loop_nutrition_cards(id) on delete cascade,
  canonical_name text not null,
  serving_label text not null,
  serving_ml numeric,
  serving_g numeric,
  prepared_volume_ml numeric,
  package_count integer,
  is_default boolean not null default false,
  confidence integer not null default 50,
  requires_user_confirmation boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists loop_nutrition_serving_options_card_idx
  on public.loop_nutrition_serving_options(card_id);

drop trigger if exists loop_nutrition_serving_options_updated_at on public.loop_nutrition_serving_options;
create trigger loop_nutrition_serving_options_updated_at
before update on public.loop_nutrition_serving_options
for each row execute function public.loop_set_updated_at();

-- Source snapshots, used both by import package and source refresh cron.
create table if not exists public.loop_nutrition_source_snapshots (
  id uuid primary key default gen_random_uuid(),
  card_id uuid references public.loop_nutrition_cards(id) on delete cascade,
  submitted_by uuid references auth.users(id) on delete set null,
  source_url text not null,
  source_host text,
  retailer_name text,
  formal_name text,
  main_image_url text,
  price_amount numeric,
  price_currency text default 'GBP',
  price_text text,
  ingredients_text text,
  allergens_text text,
  nutrition_text text,
  raw_payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  confidence integer not null default 50,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.loop_nutrition_source_snapshots
  add column if not exists import_batch_id uuid references public.loop_product_import_batches(id) on delete set null,
  add column if not exists import_row_id uuid references public.loop_product_import_rows(id) on delete set null,
  add column if not exists image_harvest_mode text;

alter table public.loop_nutrition_source_snapshots
  drop constraint if exists loop_nutrition_source_snapshots_status_check;

alter table public.loop_nutrition_source_snapshots
  add constraint loop_nutrition_source_snapshots_status_check
  check (status in ('queued','processing','ready_import','needs_review','applied','rejected','failed'));

create index if not exists loop_nutrition_source_snapshots_card_created_idx
  on public.loop_nutrition_source_snapshots(card_id, created_at desc);
create index if not exists loop_nutrition_source_snapshots_status_idx
  on public.loop_nutrition_source_snapshots(status, created_at desc);

drop trigger if exists loop_nutrition_source_snapshots_updated_at on public.loop_nutrition_source_snapshots;
create trigger loop_nutrition_source_snapshots_updated_at
before update on public.loop_nutrition_source_snapshots
for each row execute function public.loop_set_updated_at();

-- Price refresh run audit.
create table if not exists public.loop_product_price_refresh_runs (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid references auth.users(id) on delete set null,
  run_kind text not null default 'cron',
  status text not null default 'running',
  scanned_count integer not null default 0,
  updated_count integer not null default 0,
  failed_count integer not null default 0,
  notes text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

-- Shopping list planning tables.
create table if not exists public.loop_shopping_lists (
  id uuid primary key default gen_random_uuid(),
  household_id uuid,
  owner_user_id uuid references auth.users(id) on delete set null,
  title text not null default 'Shopping list',
  status text not null default 'draft',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists loop_shopping_lists_updated_at on public.loop_shopping_lists;
create trigger loop_shopping_lists_updated_at
before update on public.loop_shopping_lists
for each row execute function public.loop_set_updated_at();

create table if not exists public.loop_shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.loop_shopping_lists(id) on delete cascade,
  source_card_id uuid references public.loop_nutrition_cards(id) on delete set null,
  ingredient_name text not null,
  canonical_name text,
  quantity numeric not null,
  unit text not null default 'g',
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists loop_shopping_list_items_list_idx
  on public.loop_shopping_list_items(list_id, canonical_name, unit);

create table if not exists public.loop_shopping_purchase_suggestions (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.loop_shopping_lists(id) on delete cascade,
  ingredient_key text not null,
  card_id uuid references public.loop_nutrition_cards(id) on delete set null,
  retailer_name text,
  source_url text,
  packs integer not null default 1,
  required_quantity numeric,
  supplied_quantity numeric,
  waste_quantity numeric,
  unit text,
  price_amount numeric,
  price_currency text default 'GBP',
  score numeric,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists loop_shopping_purchase_suggestions_list_idx
  on public.loop_shopping_purchase_suggestions(list_id, ingredient_key, score);

-- Normalised key helper for shopping / matching.
drop function if exists public.loop_food_key(text);
create or replace function public.loop_food_key(p_value text)
returns text
language sql
immutable
set search_path = public, pg_catalog
as $$
  select nullif(
    regexp_replace(
      regexp_replace(lower(trim(coalesce(p_value,''))), '\b(raw|fresh|sliced|diced|large|small|medium|skinless|boneless)\b', '', 'g'),
      '[^a-z0-9]+', ' ', 'g'
    ),
    ''
  )
$$;

grant execute on function public.loop_food_key(text) to authenticated;

-- Improved matching now understands import_key/shop article/dedupe key.
drop function if exists public.loop_product_import_match_row(uuid);
create or replace function public.loop_product_import_match_row(p_row_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_row public.loop_product_import_rows%rowtype;
  v_match_id uuid;
  v_strategy text;
  v_confidence integer := 0;
  v_name_key text;
  v_brand_key text;
begin
  select * into v_row from public.loop_product_import_rows where id = p_row_id;
  if not found then
    raise exception 'Import row not found.';
  end if;

  v_name_key := public.loop_product_import_key(v_row.product_name);
  v_brand_key := public.loop_product_import_key(v_row.brand);

  if nullif(v_row.barcode,'') is not null then
    select id into v_match_id
    from public.loop_nutrition_cards
    where lower(coalesce(barcode,'')) = lower(v_row.barcode)
    order by updated_at desc
    limit 1;
    if v_match_id is not null then v_strategy := 'barcode_exact'; v_confidence := 100; end if;
  end if;

  if v_match_id is null and nullif(v_row.dedupe_key,'') is not null then
    select id into v_match_id
    from public.loop_nutrition_cards
    where lower(coalesce(dedupe_key,'')) = lower(v_row.dedupe_key)
    order by updated_at desc
    limit 1;
    if v_match_id is not null then v_strategy := 'dedupe_key_exact'; v_confidence := 99; end if;
  end if;

  if v_match_id is null and nullif(v_row.shop_tag,'') is not null and nullif(v_row.retailer_article_number,'') is not null then
    select id into v_match_id
    from public.loop_nutrition_cards
    where lower(coalesce(shop_tag,'')) = lower(v_row.shop_tag)
      and lower(coalesce(retailer_article_number,'')) = lower(v_row.retailer_article_number)
    order by updated_at desc
    limit 1;
    if v_match_id is not null then v_strategy := 'retailer_article_exact'; v_confidence := 98; end if;
  end if;

  if v_match_id is null and nullif(v_row.source_url,'') is not null then
    select id into v_match_id
    from public.loop_nutrition_cards
    where lower(coalesce(source_url,'')) = lower(v_row.source_url)
    order by updated_at desc
    limit 1;
    if v_match_id is not null then v_strategy := 'source_url_exact'; v_confidence := 96; end if;
  end if;

  if v_match_id is null and v_name_key is not null then
    select id into v_match_id
    from public.loop_nutrition_cards c
    where public.loop_product_import_key(c.display_name) = v_name_key
      and (v_brand_key is null or public.loop_product_import_key(c.brand_name) = v_brand_key)
    order by case when public.loop_product_import_key(c.brand_name) = v_brand_key then 0 else 1 end, updated_at desc
    limit 1;
    if v_match_id is not null then v_strategy := 'brand_name_exact'; v_confidence := case when v_brand_key is not null then 90 else 78 end; end if;
  end if;

  update public.loop_product_import_rows
  set
    existing_card_id = v_match_id,
    match_strategy = v_strategy,
    match_confidence = v_confidence,
    status = case
      when v_match_id is not null and v_confidence >= 90 then 'matched_existing'
      when v_match_id is not null then 'needs_review'
      else 'ready_to_create'
    end,
    warnings = case
      when v_match_id is not null and v_confidence < 90 then array_append(warnings, 'Possible existing product match. Review before applying.')
      else warnings
    end
  where id = p_row_id;

  perform public.loop_product_import_recount(v_row.batch_id);

  return jsonb_build_object('row_id', p_row_id, 'existing_card_id', v_match_id, 'match_strategy', v_strategy, 'match_confidence', v_confidence);
end;
$$;

grant execute on function public.loop_product_import_match_row(uuid) to authenticated;

-- Roll up shopping list ingredients into total required quantities.
drop function if exists public.loop_shopping_list_rollup(uuid);
create or replace function public.loop_shopping_list_rollup(p_list_id uuid)
returns table(
  ingredient_key text,
  display_name text,
  total_quantity numeric,
  unit text,
  line_count bigint
)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select
    public.loop_food_key(coalesce(canonical_name, ingredient_name)) as ingredient_key,
    min(ingredient_name) as display_name,
    sum(case
      when lower(unit) = 'kg' then quantity * 1000
      when lower(unit) = 'l' then quantity * 1000
      else quantity
    end) as total_quantity,
    case
      when lower(unit) in ('kg','g') then 'g'
      when lower(unit) in ('l','ml') then 'ml'
      else lower(unit)
    end as unit,
    count(*) as line_count
  from public.loop_shopping_list_items
  where list_id = p_list_id
  group by 1, 4
  order by 2;
$$;

grant execute on function public.loop_shopping_list_rollup(uuid) to authenticated;


-- RLS for new tables. Admin/service actions can write; authenticated users can read shared product support data.
alter table public.loop_nutrition_source_snapshots enable row level security;
alter table public.loop_product_price_refresh_runs enable row level security;
alter table public.loop_shopping_lists enable row level security;
alter table public.loop_shopping_list_items enable row level security;
alter table public.loop_shopping_purchase_suggestions enable row level security;

drop policy if exists "source snapshots readable through shared cards" on public.loop_nutrition_source_snapshots;
create policy "source snapshots readable through shared cards" on public.loop_nutrition_source_snapshots
for select to authenticated using (
  exists (
    select 1 from public.loop_nutrition_cards c
    where c.id = card_id and (c.visibility = 'shared_database' or c.owner_user_id = auth.uid())
  )
);

drop policy if exists "shopping lists owner readable" on public.loop_shopping_lists;
create policy "shopping lists owner readable" on public.loop_shopping_lists
for select to authenticated using (owner_user_id = auth.uid());

drop policy if exists "shopping lists owner writable" on public.loop_shopping_lists;
create policy "shopping lists owner writable" on public.loop_shopping_lists
for all to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

drop policy if exists "shopping items through list" on public.loop_shopping_list_items;
create policy "shopping items through list" on public.loop_shopping_list_items
for all to authenticated using (
  exists (select 1 from public.loop_shopping_lists l where l.id = list_id and l.owner_user_id = auth.uid())
) with check (
  exists (select 1 from public.loop_shopping_lists l where l.id = list_id and l.owner_user_id = auth.uid())
);

drop policy if exists "shopping suggestions through list" on public.loop_shopping_purchase_suggestions;
create policy "shopping suggestions through list" on public.loop_shopping_purchase_suggestions
for select to authenticated using (
  exists (select 1 from public.loop_shopping_lists l where l.id = list_id and l.owner_user_id = auth.uid())
);


drop function if exists public.loop_v2770_import_price_shopping_healthcheck();
create or replace function public.loop_v2770_import_price_shopping_healthcheck()
returns table(check_name text, ok boolean, detail text)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select 'import_rows_package_columns', exists(select 1 from information_schema.columns where table_schema='public' and table_name='loop_product_import_rows' and column_name='supporting_payload'), 'Import rows can store package supporting files.'
  union all
  select 'source_snapshots_table', to_regclass('public.loop_nutrition_source_snapshots') is not null, 'Source snapshots table exists.'
  union all
  select 'price_refresh_runs_table', to_regclass('public.loop_product_price_refresh_runs') is not null, 'Price refresh audit table exists.'
  union all
  select 'shopping_lists_table', to_regclass('public.loop_shopping_lists') is not null, 'Shopping list tables exist.'
  union all
  select 'shopping_rollup_rpc', exists(select 1 from pg_proc where proname='loop_shopping_list_rollup'), 'Shopping rollup RPC exists.'
  union all
  select 'improved_match_rpc', exists(select 1 from pg_proc where proname='loop_product_import_match_row'), 'Improved matching RPC exists.';
$$;

grant execute on function public.loop_v2770_import_price_shopping_healthcheck() to anon;
grant execute on function public.loop_v2770_import_price_shopping_healthcheck() to authenticated;


-- ============================================================
-- db/v27_71_product_identity_barcode_match_first.sql
-- ============================================================

-- v27.71 Product identity / barcode / match-first logic
-- Run after v27.67/v27.69/v27.70.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create or replace function public.loop_set_updated_at()
returns trigger language plpgsql set search_path = public, pg_catalog as $$
begin new.updated_at = now(); return new; end; $$;

-- Minimal safety if the table was not created yet. If it exists, this is harmless.
create table if not exists public.loop_nutrition_cards (
  id uuid primary key default gen_random_uuid(),
  card_kind text not null default 'product',
  visibility text not null default 'shared_database',
  product_type text not null default 'food',
  owner_user_id uuid references auth.users(id) on delete set null,
  household_id uuid,
  display_name text not null,
  formal_name text,
  brand_name text,
  variant_name text,
  source_url text,
  source_host text,
  main_image_url text,
  serving_label text,
  serving_ml numeric,
  serving_g numeric,
  prepared_volume_ml numeric,
  calories numeric,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  fibre_g numeric,
  sugar_g numeric,
  salt_g numeric,
  caffeine_mg numeric,
  nutrition jsonb not null default '{}'::jsonb,
  confidence integer not null default 50,
  score integer,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.loop_nutrition_cards
  add column if not exists barcode text,
  add column if not exists gtin text,
  add column if not exists gtin14 text,
  add column if not exists source_provider text,
  add column if not exists source_priority integer not null default 500,
  add column if not exists retailer_name text,
  add column if not exists category text,
  add column if not exists pack_size text,
  add column if not exists canonical_search_text text,
  add column if not exists data_origin text not null default 'unknown',
  add column if not exists match_status text not null default 'unresolved',
  add column if not exists last_provider_sync_at timestamptz,
  add column if not exists external_ids jsonb not null default '{}'::jsonb,
  add column if not exists imported_source_batch text;

create index if not exists loop_nutrition_cards_barcode_idx on public.loop_nutrition_cards(barcode);
create index if not exists loop_nutrition_cards_gtin14_idx on public.loop_nutrition_cards(gtin14);
create index if not exists loop_nutrition_cards_provider_idx on public.loop_nutrition_cards(source_provider, source_priority);
create index if not exists loop_nutrition_cards_canonical_trgm_idx on public.loop_nutrition_cards using gin (lower(coalesce(canonical_search_text, display_name, '')) gin_trgm_ops);

create or replace function public.loop_digits_only(p_value text)
returns text language sql immutable set search_path = public, pg_catalog as $$
  select regexp_replace(coalesce(p_value, ''), '[^0-9]', '', 'g');
$$;

drop function if exists public.loop_gtin_is_valid(text);
create or replace function public.loop_gtin_is_valid(p_value text)
returns boolean language plpgsql immutable set search_path = public, pg_catalog as $$
declare
  v text := public.loop_digits_only(p_value); v_body text; v_check int; v_sum int := 0; v_i int; v_digit int; v_pos int := 1; v_calc int;
begin
  if length(v) not in (8,12,13,14) then return false; end if;
  v_body := left(v, length(v)-1); v_check := right(v,1)::int;
  for v_i in reverse length(v_body)..1 loop
    v_digit := substr(v_body, v_i, 1)::int;
    if (v_pos % 2) = 1 then v_sum := v_sum + (v_digit * 3); else v_sum := v_sum + v_digit; end if;
    v_pos := v_pos + 1;
  end loop;
  v_calc := (10 - (v_sum % 10)) % 10;
  return v_calc = v_check;
end; $$;

create or replace function public.loop_gtin_to14(p_value text)
returns text language sql immutable set search_path = public, pg_catalog as $$
  select case when public.loop_gtin_is_valid(p_value) then lpad(public.loop_digits_only(p_value), 14, '0') else null end;
$$;

create or replace function public.loop_normalise_product_query(p_value text)
returns text language sql immutable set search_path = public, pg_catalog as $$
  select trim(regexp_replace(regexp_replace(lower(coalesce(p_value,'')), '\b(i had|i ate|i drank|from|a|an|the|meal|ready meal|pasta meal|for breakfast|for lunch|for dinner)\b', ' ', 'g'), '\s+', ' ', 'g'));
$$;

grant execute on function public.loop_digits_only(text) to anon, authenticated;
grant execute on function public.loop_gtin_is_valid(text) to anon, authenticated;
grant execute on function public.loop_gtin_to14(text) to anon, authenticated;
grant execute on function public.loop_normalise_product_query(text) to anon, authenticated;

create table if not exists public.loop_product_data_providers (
  source_key text primary key,
  name text not null,
  source_kind text not null,
  priority integer not null default 500,
  enabled boolean not null default true,
  supports_barcode boolean not null default false,
  supports_price boolean not null default false,
  supports_image boolean not null default false,
  supports_nutrition boolean not null default false,
  supports_ingredients boolean not null default false,
  supports_allergens boolean not null default false,
  requires_api_key boolean not null default false,
  website_url text,
  terms_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.loop_product_data_providers
(source_key,name,source_kind,priority,enabled,supports_barcode,supports_price,supports_image,supports_nutrition,supports_ingredients,supports_allergens,requires_api_key,website_url,terms_note)
values
('admin_verified','Admin verified LOOP data','internal',10,true,true,true,true,true,true,true,false,'https://insideloop.life','Highest trust; do not overwrite without admin approval.'),
('manual_import','Manual CSV/ZIP import','manual',50,true,true,true,true,true,true,true,false,'https://insideloop.life','Imported rows are staged and matched before applying.'),
('open_food_facts','Open Food Facts','open_data',90,true,true,false,true,true,true,true,false,'https://world.openfoodfacts.org','Use API with custom User-Agent and local cache.'),
('gs1_digital_link','GS1 Digital Link / GTIN identity','standards',100,true,true,false,false,false,false,false,false,'https://id.gs1.org','GTIN validation and Digital Link resolver support; product data depends on brand/partner access.'),
('gs1_verified_by_gs1','Verified by GS1 / GDSN adapter','standards',110,false,true,false,false,false,false,false,true,'https://www.gs1.org','Optional commercial/partner adapter; disabled unless credentials/feed are available.'),
('affiliate_feed','Affiliate/product feed','commercial_feed',150,false,true,true,true,false,false,false,true,null,'Optional retailer/affiliate feed adapter.'),
('retailer_source_url','Retailer product page URL','retailer_url',200,true,false,true,true,true,true,true,false,null,'Polite source URL checks only; no bot-protection bypass.'),
('ai_estimate','AI estimate','ai',900,true,false,false,false,true,true,true,true,'https://insideloop.life','Lowest priority; only after local/import/provider matching fails.')
on conflict (source_key) do update set
  name=excluded.name, source_kind=excluded.source_kind, priority=excluded.priority, enabled=excluded.enabled,
  supports_barcode=excluded.supports_barcode, supports_price=excluded.supports_price, supports_image=excluded.supports_image,
  supports_nutrition=excluded.supports_nutrition, supports_ingredients=excluded.supports_ingredients, supports_allergens=excluded.supports_allergens,
  requires_api_key=excluded.requires_api_key, website_url=excluded.website_url, terms_note=excluded.terms_note, updated_at=now();

create table if not exists public.loop_product_identifier_observations (
  id uuid primary key default gen_random_uuid(),
  card_id uuid references public.loop_nutrition_cards(id) on delete cascade,
  identifier_kind text not null,
  identifier_value text not null,
  identifier_digits text,
  gtin14 text,
  source_key text references public.loop_product_data_providers(source_key) on delete set null,
  source_url text,
  confidence integer not null default 60,
  created_at timestamptz not null default now()
);
create index if not exists loop_product_identifier_value_idx on public.loop_product_identifier_observations(identifier_digits, gtin14);

create table if not exists public.loop_product_source_cache (
  id uuid primary key default gen_random_uuid(),
  source_key text references public.loop_product_data_providers(source_key) on delete cascade,
  cache_key text not null,
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  status text not null default 'fresh',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_key, cache_key)
);

create table if not exists public.loop_product_resolution_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  household_id uuid,
  query_text text,
  barcode text,
  gtin14 text,
  retailer_hint text,
  status text not null default 'started',
  resolved_card_id uuid references public.loop_nutrition_cards(id) on delete set null,
  candidates jsonb not null default '[]'::jsonb,
  source_trace jsonb not null default '[]'::jsonb,
  ai_allowed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.loop_barcode_scan_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  household_id uuid,
  scanned_value text not null,
  scanned_digits text,
  gtin14 text,
  is_valid_gtin boolean not null default false,
  scan_context text not null default 'food_log',
  matched_card_id uuid references public.loop_nutrition_cards(id) on delete set null,
  status text not null default 'scanned',
  candidates jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.loop_product_data_providers enable row level security;
alter table public.loop_product_identifier_observations enable row level security;
alter table public.loop_product_source_cache enable row level security;
alter table public.loop_product_resolution_attempts enable row level security;
alter table public.loop_barcode_scan_events enable row level security;

drop policy if exists "providers readable" on public.loop_product_data_providers;
create policy "providers readable" on public.loop_product_data_providers for select to authenticated using (enabled = true);
drop policy if exists "identifier observations readable" on public.loop_product_identifier_observations;
create policy "identifier observations readable" on public.loop_product_identifier_observations for select to authenticated using (true);
drop policy if exists "source cache admin readable" on public.loop_product_source_cache;
create policy "source cache admin readable" on public.loop_product_source_cache for select to authenticated using (coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin','') = 'true');
drop policy if exists "resolution attempts own read" on public.loop_product_resolution_attempts;
create policy "resolution attempts own read" on public.loop_product_resolution_attempts for select to authenticated using (user_id = auth.uid() or coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin','') = 'true');
drop policy if exists "resolution attempts own insert" on public.loop_product_resolution_attempts;
create policy "resolution attempts own insert" on public.loop_product_resolution_attempts for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "barcode scan own read" on public.loop_barcode_scan_events;
create policy "barcode scan own read" on public.loop_barcode_scan_events for select to authenticated using (user_id = auth.uid() or coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin','') = 'true');
drop policy if exists "barcode scan own insert" on public.loop_barcode_scan_events;
create policy "barcode scan own insert" on public.loop_barcode_scan_events for insert to authenticated with check (user_id = auth.uid());

update public.loop_nutrition_cards
set canonical_search_text = trim(regexp_replace(lower(coalesce(display_name,'') || ' ' || coalesce(formal_name,'') || ' ' || coalesce(brand_name,'') || ' ' || coalesce(variant_name,'') || ' ' || coalesce(category,'') || ' ' || coalesce(retailer_name,'') || ' ' || coalesce(pack_size,'')), '\s+', ' ', 'g'))
where canonical_search_text is null or canonical_search_text = '';

update public.loop_nutrition_cards
set gtin14 = public.loop_gtin_to14(coalesce(gtin, barcode))
where gtin14 is null and public.loop_gtin_is_valid(coalesce(gtin, barcode));

insert into public.loop_product_identifier_observations(card_id, identifier_kind, identifier_value, identifier_digits, gtin14, source_key, confidence)
select c.id, 'gtin', coalesce(c.gtin, c.barcode), public.loop_digits_only(coalesce(c.gtin, c.barcode)), c.gtin14, coalesce(c.source_provider, 'manual_import'), 80
from public.loop_nutrition_cards c
where c.gtin14 is not null
and not exists (select 1 from public.loop_product_identifier_observations o where o.card_id = c.id and o.gtin14 = c.gtin14);

drop function if exists public.loop_product_candidate_search(text,text,text,integer);
create or replace function public.loop_product_candidate_search(p_query text default null, p_barcode text default null, p_retailer text default null, p_limit integer default 8)
returns table (
  card_id uuid, display_name text, formal_name text, brand_name text, retailer_name text, product_type text, card_kind text,
  barcode text, gtin text, gtin14 text, source_provider text, source_priority integer, main_image_url text,
  calories numeric, protein_g numeric, carbs_g numeric, fat_g numeric, fibre_g numeric, sugar_g numeric, salt_g numeric, caffeine_mg numeric,
  confidence integer, match_score numeric, match_reason text
)
language sql security definer set search_path = public, pg_catalog as $$
  with input as (
    select public.loop_normalise_product_query(p_query) as q,
           public.loop_digits_only(p_barcode) as barcode_digits,
           public.loop_gtin_to14(p_barcode) as q_gtin14,
           lower(trim(coalesce(p_retailer,''))) as retailer,
           greatest(1, least(coalesce(p_limit,8),30)) as lim
  ), scored as (
    select c.*,
      case
        when i.q_gtin14 is not null and c.gtin14 = i.q_gtin14 then 100::numeric
        when i.barcode_digits <> '' and public.loop_digits_only(coalesce(c.barcode,c.gtin,'')) = i.barcode_digits then 98::numeric
        when i.q <> '' and lower(coalesce(c.canonical_search_text,c.display_name,'')) = i.q then 92::numeric
        when i.q <> '' and lower(coalesce(c.canonical_search_text,c.display_name,'')) like '%' || i.q || '%' then 82::numeric
        when i.q <> '' then round((similarity(lower(coalesce(c.canonical_search_text,c.display_name,'')), i.q) * 75)::numeric, 2)
        else 0::numeric
      end
      + case when i.retailer <> '' and lower(coalesce(c.retailer_name,'')) like '%' || i.retailer || '%' then 8::numeric
             when i.retailer <> '' and lower(coalesce(c.source_host,'')) like '%' || i.retailer || '%' then 5::numeric else 0::numeric end
      + case when c.source_provider = 'admin_verified' then 8::numeric when c.source_provider = 'manual_import' then 6::numeric when c.source_provider = 'open_food_facts' then 4::numeric else 0::numeric end
      - greatest(0, coalesce(c.source_priority,500)-100)/100.0 as score_value,
      case
        when i.q_gtin14 is not null and c.gtin14 = i.q_gtin14 then 'GTIN exact match'
        when i.barcode_digits <> '' and public.loop_digits_only(coalesce(c.barcode,c.gtin,'')) = i.barcode_digits then 'Barcode exact match'
        when i.q <> '' and lower(coalesce(c.canonical_search_text,c.display_name,'')) = i.q then 'Exact product text match'
        when i.q <> '' and lower(coalesce(c.canonical_search_text,c.display_name,'')) like '%' || i.q || '%' then 'Product text contains query'
        when i.q <> '' and similarity(lower(coalesce(c.canonical_search_text,c.display_name,'')), i.q) > 0.18 then 'Fuzzy product match'
        else 'Low confidence'
      end as reason
    from public.loop_nutrition_cards c cross join input i
    where c.status = 'active' and c.card_kind in ('product','ingredient') and (
      (i.q_gtin14 is not null and c.gtin14 = i.q_gtin14)
      or (i.barcode_digits <> '' and public.loop_digits_only(coalesce(c.barcode,c.gtin,'')) = i.barcode_digits)
      or (i.q <> '' and (lower(coalesce(c.canonical_search_text,c.display_name,'')) like '%' || i.q || '%' or similarity(lower(coalesce(c.canonical_search_text,c.display_name,'')), i.q) > 0.18))
    )
  )
  select id, display_name, formal_name, brand_name, retailer_name, product_type, card_kind, barcode, gtin, gtin14, source_provider, source_priority, main_image_url,
         calories, protein_g, carbs_g, fat_g, fibre_g, sugar_g, salt_g, caffeine_mg, confidence,
         greatest(0, least(100, score_value)) as match_score, reason as match_reason
  from scored order by score_value desc, confidence desc, updated_at desc limit (select lim from input);
$$;
grant execute on function public.loop_product_candidate_search(text,text,text,integer) to authenticated;

drop function if exists public.loop_record_barcode_scan(text,uuid,text);
create or replace function public.loop_record_barcode_scan(p_scanned_value text, p_household_id uuid default null, p_scan_context text default 'food_log')
returns jsonb language plpgsql security definer set search_path = public, auth, pg_catalog as $$
declare v_digits text := public.loop_digits_only(p_scanned_value); v_gtin14 text := public.loop_gtin_to14(p_scanned_value); v_valid boolean := public.loop_gtin_is_valid(p_scanned_value); v_candidates jsonb; v_first uuid; v_status text; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated.'; end if;
  select coalesce(jsonb_agg(to_jsonb(c) order by c.match_score desc), '[]'::jsonb) into v_candidates from public.loop_product_candidate_search(null, p_scanned_value, null, 8) c;
  select (v_candidates -> 0 ->> 'card_id')::uuid into v_first;
  v_status := case when not v_valid then 'invalid' when v_first is not null then 'local_match' else 'provider_lookup' end;
  insert into public.loop_barcode_scan_events(user_id, household_id, scanned_value, scanned_digits, gtin14, is_valid_gtin, scan_context, matched_card_id, status, candidates)
  values (auth.uid(), p_household_id, p_scanned_value, v_digits, v_gtin14, v_valid, coalesce(p_scan_context,'food_log'), v_first, v_status, v_candidates) returning id into v_id;
  return jsonb_build_object('ok', true, 'scan_event_id', v_id, 'digits', v_digits, 'gtin14', v_gtin14, 'is_valid_gtin', v_valid, 'status', v_status, 'candidates', v_candidates);
end; $$;
grant execute on function public.loop_record_barcode_scan(text,uuid,text) to authenticated;

drop function if exists public.loop_v2771_product_identity_healthcheck();
create or replace function public.loop_v2771_product_identity_healthcheck()
returns table(check_name text, ok boolean, detail text)
language sql security definer set search_path = public, pg_catalog as $$
  select 'pg_trgm_extension'::text, exists(select 1 from pg_extension where extname='pg_trgm'), 'pg_trgm enabled for fuzzy matching.'
  union all select 'provider_registry', to_regclass('public.loop_product_data_providers') is not null, 'Provider registry exists.'
  union all select 'open_food_facts_provider', exists(select 1 from public.loop_product_data_providers where source_key='open_food_facts' and enabled=true), 'Open Food Facts registered.'
  union all select 'gs1_provider', exists(select 1 from public.loop_product_data_providers where source_key='gs1_digital_link' and enabled=true), 'GS1 Digital Link registered.'
  union all select 'barcode_scan_events', to_regclass('public.loop_barcode_scan_events') is not null, 'Barcode scan table exists.'
  union all select 'candidate_search_rpc', exists(select 1 from pg_proc where proname='loop_product_candidate_search'), 'Candidate search RPC exists.'
  union all select 'gtin_validation', public.loop_gtin_is_valid('5000112546415') = true, 'GTIN validation works.'
  union all select 'gtin_to14', public.loop_gtin_to14('5000112546415') = '05000112546415', 'GTIN-13 pads to GTIN-14.';
$$;
grant execute on function public.loop_v2771_product_identity_healthcheck() to anon, authenticated;


-- ============================================================
-- db/v27_72_admin_domain_money_strategy.sql
-- ============================================================

-- v27.72 LOOP Admin domain hardening + Money Strategy / Savings Deal Tracker
--
-- Run after current app migrations.
--
-- Adds:
-- 1) Admin audit/event logging tables and helpers.
-- 2) Embedded deployment/security checklist state.
-- 3) Money agenda/profile tables.
-- 4) Savings deal library with conditions/source/price-like observation history.
-- 5) Match/recommendation functions for monthly savings strategy.
-- 6) Notification queue for better-deal alerts.
--
-- Important:
-- This does not give regulated financial advice. It stores/checks deal facts,
-- conditions and estimated gross benefit so the user can compare options.

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

-- ------------------------------------------------------------
-- Admin audit + deployment checklist
-- ------------------------------------------------------------
create table if not exists public.loop_admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_email text,
  action_key text not null,
  entity_kind text,
  entity_id text,
  before_payload jsonb,
  after_payload jsonb,
  request_host text,
  request_ip text,
  user_agent text,
  severity text not null default 'info',
  created_at timestamptz not null default now(),
  constraint loop_admin_audit_events_severity_check check (severity in ('info','warning','critical'))
);

create index if not exists loop_admin_audit_events_actor_idx on public.loop_admin_audit_events(actor_user_id, created_at desc);
create index if not exists loop_admin_audit_events_action_idx on public.loop_admin_audit_events(action_key, created_at desc);

create table if not exists public.loop_admin_deployment_checks (
  check_key text primary key,
  title text not null,
  area text not null,
  description text not null,
  required_for_live boolean not null default true,
  status text not null default 'todo',
  instructions text not null,
  env_keys text[] not null default array[]::text[],
  sort_order integer not null default 100,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint loop_admin_deployment_checks_status_check check (status in ('todo','in_progress','done','not_applicable'))
);

create table if not exists public.loop_admin_runtime_checks (
  id uuid primary key default gen_random_uuid(),
  check_key text not null,
  status text not null,
  detail text,
  request_host text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint loop_admin_runtime_checks_status_check check (status in ('pass','warn','fail','info'))
);

alter table public.loop_admin_audit_events enable row level security;
alter table public.loop_admin_deployment_checks enable row level security;
alter table public.loop_admin_runtime_checks enable row level security;

drop function if exists public.loop_is_platform_admin();
create or replace function public.loop_is_platform_admin()
returns boolean
language sql
stable
set search_path = public, pg_catalog
as $$
  select
    coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin', '') = 'true'
    or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','owner','super_admin')
    or coalesce(auth.jwt() -> 'user_metadata' ->> 'loop_admin', '') = 'true';
$$;

grant execute on function public.loop_is_platform_admin() to authenticated;

drop policy if exists "admin audit admin read" on public.loop_admin_audit_events;
create policy "admin audit admin read" on public.loop_admin_audit_events
for select to authenticated using (public.loop_is_platform_admin());

drop policy if exists "admin audit admin insert" on public.loop_admin_audit_events;
create policy "admin audit admin insert" on public.loop_admin_audit_events
for insert to authenticated with check (public.loop_is_platform_admin());

drop policy if exists "deployment checks admin read" on public.loop_admin_deployment_checks;
create policy "deployment checks admin read" on public.loop_admin_deployment_checks
for select to authenticated using (public.loop_is_platform_admin());

drop policy if exists "deployment checks admin update" on public.loop_admin_deployment_checks;
create policy "deployment checks admin update" on public.loop_admin_deployment_checks
for update to authenticated using (public.loop_is_platform_admin()) with check (public.loop_is_platform_admin());

drop policy if exists "runtime checks admin read" on public.loop_admin_runtime_checks;
create policy "runtime checks admin read" on public.loop_admin_runtime_checks
for select to authenticated using (public.loop_is_platform_admin());

drop policy if exists "runtime checks admin insert" on public.loop_admin_runtime_checks;
create policy "runtime checks admin insert" on public.loop_admin_runtime_checks
for insert to authenticated with check (public.loop_is_platform_admin());

insert into public.loop_admin_deployment_checks
(check_key, title, area, description, required_for_live, status, instructions, env_keys, sort_order)
values
(
  'admin_subdomain_dns',
  'Create admin subdomain',
  'Domain',
  'Create admin.insideloop.life and point it to the same deployment initially.',
  true,
  'todo',
  'Create DNS record for admin.insideloop.life. In Vercel/Render/host, attach admin.insideloop.life to the same app. Keep localhost allowed for development.',
  array['LOOP_ADMIN_HOSTS','LOOP_PUBLIC_HOSTS'],
  10
),
(
  'admin_host_guard',
  'Enable admin host guard',
  'Security',
  'Block /admin on public app domains once live.',
  true,
  'todo',
  'Set LOOP_ENFORCE_ADMIN_HOST=true in production. Keep LOOP_ALLOW_LOCAL_ADMIN=true while developing locally. Confirm /admin works on admin.insideloop.life and redirects/blocks on app.insideloop.life.',
  array['LOOP_ENFORCE_ADMIN_HOST','LOOP_ALLOW_LOCAL_ADMIN','LOOP_ADMIN_HOSTS'],
  20
),
(
  'supabase_redirects',
  'Add Supabase auth redirects',
  'Supabase',
  'Supabase must allow app and admin callback URLs.',
  true,
  'todo',
  'In Supabase Auth > URL Configuration, set Site URL to your public app URL. Add redirect URLs for http://localhost:3000/**, https://app.insideloop.life/**, https://admin.insideloop.life/** and https://insideloop.life/** if used.',
  array['NEXT_PUBLIC_SITE_URL','NEXT_PUBLIC_ADMIN_URL'],
  30
),
(
  'admin_allowlist',
  'Configure admin allowlist',
  'Security',
  'Only nominated admin emails should access admin.',
  true,
  'todo',
  'Set LOOP_ADMIN_ALLOWLIST=dan@insideloop.life or a comma-separated list. Admin checks must run server-side. Do not rely on hiding links only.',
  array['LOOP_ADMIN_ALLOWLIST'],
  40
),
(
  'cron_secret',
  'Protect cron routes',
  'Security',
  'Cron routes must require a bearer secret, not just admin login.',
  true,
  'todo',
  'Set LOOP_CRON_SECRET to a long random value. Configure Vercel/Render cron to call endpoints with Authorization: Bearer <secret>.',
  array['LOOP_CRON_SECRET'],
  50
),
(
  'no_service_role_browser',
  'Keep service role server-only',
  'Security',
  'Supabase service role must never be exposed client-side.',
  true,
  'todo',
  'Only use SUPABASE_SERVICE_ROLE_KEY in server actions, route handlers and workers. Never prefix it with NEXT_PUBLIC_.',
  array['SUPABASE_SERVICE_ROLE_KEY'],
  60
),
(
  'admin_noindex_headers',
  'Noindex admin pages',
  'Security',
  'Admin pages should not be indexed or surfaced by search engines.',
  true,
  'todo',
  'Middleware now adds X-Robots-Tag: noindex, nofollow to admin paths. Confirm this header on admin pages before beta.',
  array[],
  70
),
(
  'money_deal_sources',
  'Money deal source process',
  'Money',
  'Set how savings deals are added/refreshed.',
  false,
  'todo',
  'For beta, add savings deals manually or via CSV/admin. Later add official/affiliate/commercial feeds. Cron can check source URLs politely but must not bypass bot protection.',
  array['LOOP_MONEY_DEAL_REFRESH_LIMIT','LOOP_MONEY_DEAL_REFRESH_DELAY_MS'],
  80
)
on conflict (check_key) do update set
  title = excluded.title,
  area = excluded.area,
  description = excluded.description,
  required_for_live = excluded.required_for_live,
  instructions = excluded.instructions,
  env_keys = excluded.env_keys,
  sort_order = excluded.sort_order;

-- ------------------------------------------------------------
-- Money strategy
-- ------------------------------------------------------------
create table if not exists public.loop_money_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid,
  profile_name text not null default 'My money plan',
  monthly_available_savings_pence integer not null default 0,
  emergency_fund_target_pence integer,
  current_cash_savings_pence integer,
  existing_average_cash_rate_aer numeric,
  expected_investment_return_aer numeric,
  risk_preference text not null default 'cash_first',
  liquidity_preference text not null default 'easy_access_first',
  tax_band text,
  notes text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loop_money_profiles_risk_check check (risk_preference in ('cash_first','balanced','investment_focused','custom')),
  constraint loop_money_profiles_liquidity_check check (liquidity_preference in ('easy_access_first','regular_saver_ok','fixed_term_ok','custom')),
  constraint loop_money_profiles_status_check check (status in ('active','paused','archived'))
);

create unique index if not exists loop_money_profiles_user_active_idx
on public.loop_money_profiles(user_id)
where status = 'active';

drop trigger if exists loop_money_profiles_updated_at on public.loop_money_profiles;
create trigger loop_money_profiles_updated_at
before update on public.loop_money_profiles
for each row execute function public.loop_set_updated_at();

create table if not exists public.loop_money_savings_agenda_items (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.loop_money_profiles(id) on delete cascade,
  label text not null,
  monthly_amount_pence integer not null default 0,
  current_balance_pence integer,
  current_rate_aer numeric,
  account_provider text,
  account_name text,
  pot_type text not null default 'cash_savings',
  priority integer not null default 100,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loop_money_savings_agenda_items_type_check check (pot_type in ('cash_savings','regular_saver','easy_access','isa','investment','pension','debt_repayment','other'))
);

drop trigger if exists loop_money_savings_agenda_items_updated_at on public.loop_money_savings_agenda_items;
create trigger loop_money_savings_agenda_items_updated_at
before update on public.loop_money_savings_agenda_items
for each row execute function public.loop_set_updated_at();

create table if not exists public.loop_money_savings_deals (
  id uuid primary key default gen_random_uuid(),
  provider_name text not null,
  product_name text not null,
  product_type text not null default 'regular_saver',
  rate_aer numeric not null,
  gross_rate numeric,
  rate_type text not null default 'variable',
  min_monthly_pence integer,
  max_monthly_pence integer,
  max_balance_pence integer,
  min_opening_pence integer,
  term_months integer,
  access_type text not null default 'restricted',
  fscs_covered boolean,
  requires_current_account boolean not null default false,
  requires_switch boolean not null default false,
  requires_direct_debits boolean not null default false,
  requires_min_monthly_pay_in boolean not null default false,
  min_monthly_pay_in_pence integer,
  new_customers_only boolean not null default false,
  eligibility_notes text,
  conditions jsonb not null default '{}'::jsonb,
  opening_url text,
  source_url text,
  source_provider text not null default 'manual',
  source_confidence integer not null default 50,
  rate_last_checked_at timestamptz,
  next_check_at timestamptz,
  status text not null default 'active',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loop_money_savings_deals_type_check check (product_type in ('regular_saver','easy_access','fixed_saver','cash_isa','notice_account','current_account_linked','other')),
  constraint loop_money_savings_deals_rate_type_check check (rate_type in ('fixed','variable','bonus','introductory','unknown')),
  constraint loop_money_savings_deals_access_type_check check (access_type in ('easy_access','notice','fixed_term','restricted','unknown')),
  constraint loop_money_savings_deals_status_check check (status in ('draft','active','expired','withdrawn','needs_review')),
  constraint loop_money_savings_deals_confidence_check check (source_confidence between 0 and 100)
);

create index if not exists loop_money_savings_deals_active_rate_idx
on public.loop_money_savings_deals(status, rate_aer desc, updated_at desc);

create index if not exists loop_money_savings_deals_provider_idx
on public.loop_money_savings_deals(lower(provider_name), product_type);

drop trigger if exists loop_money_savings_deals_updated_at on public.loop_money_savings_deals;
create trigger loop_money_savings_deals_updated_at
before update on public.loop_money_savings_deals
for each row execute function public.loop_set_updated_at();

create table if not exists public.loop_money_deal_observations (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references public.loop_money_savings_deals(id) on delete cascade,
  provider_name text,
  product_name text,
  rate_aer numeric,
  max_monthly_pence integer,
  max_balance_pence integer,
  term_months integer,
  source_url text,
  source_provider text not null default 'manual',
  observed_payload jsonb not null default '{}'::jsonb,
  confidence integer not null default 50,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint loop_money_deal_observations_confidence_check check (confidence between 0 and 100)
);

create index if not exists loop_money_deal_observations_deal_idx
on public.loop_money_deal_observations(deal_id, observed_at desc);

create table if not exists public.loop_money_strategy_opportunities (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.loop_money_profiles(id) on delete cascade,
  deal_id uuid references public.loop_money_savings_deals(id) on delete cascade,
  status text not null default 'new',
  recommended_monthly_pence integer not null default 0,
  remaining_monthly_pence integer not null default 0,
  estimated_gross_interest_pence integer,
  estimated_incremental_gross_interest_pence integer,
  comparison_months integer not null default 12,
  current_rate_aer numeric,
  candidate_rate_aer numeric,
  suitability_score integer not null default 50,
  reason text,
  condition_warnings text[] not null default array[]::text[],
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loop_money_strategy_opportunities_status_check check (status in ('new','seen','watching','dismissed','acted_on','expired')),
  constraint loop_money_strategy_opportunities_score_check check (suitability_score between 0 and 100)
);

create index if not exists loop_money_strategy_opportunities_profile_idx
on public.loop_money_strategy_opportunities(profile_id, status, created_at desc);

drop trigger if exists loop_money_strategy_opportunities_updated_at on public.loop_money_strategy_opportunities;
create trigger loop_money_strategy_opportunities_updated_at
before update on public.loop_money_strategy_opportunities
for each row execute function public.loop_set_updated_at();

create table if not exists public.loop_money_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid references public.loop_money_profiles(id) on delete cascade,
  opportunity_id uuid references public.loop_money_strategy_opportunities(id) on delete set null,
  notification_kind text not null default 'better_savings_deal',
  title text not null,
  body text,
  action_url text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'unread',
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint loop_money_notifications_status_check check (status in ('unread','read','archived')),
  constraint loop_money_notifications_kind_check check (notification_kind in ('better_savings_deal','condition_change','rate_changed','deal_expiring','profile_gap'))
);

create index if not exists loop_money_notifications_user_idx
on public.loop_money_notifications(user_id, status, created_at desc);

create table if not exists public.loop_money_deal_refresh_jobs (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references public.loop_money_savings_deals(id) on delete cascade,
  source_url text not null,
  status text not null default 'queued',
  attempts integer not null default 0,
  last_error text,
  result_payload jsonb not null default '{}'::jsonb,
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  constraint loop_money_deal_refresh_jobs_status_check check (status in ('queued','processing','needs_review','applied','failed','skipped'))
);

create index if not exists loop_money_deal_refresh_jobs_status_idx
on public.loop_money_deal_refresh_jobs(status, queued_at);

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
alter table public.loop_money_profiles enable row level security;
alter table public.loop_money_savings_agenda_items enable row level security;
alter table public.loop_money_savings_deals enable row level security;
alter table public.loop_money_deal_observations enable row level security;
alter table public.loop_money_strategy_opportunities enable row level security;
alter table public.loop_money_notifications enable row level security;
alter table public.loop_money_deal_refresh_jobs enable row level security;

drop policy if exists "money profiles self" on public.loop_money_profiles;
create policy "money profiles self" on public.loop_money_profiles
for all to authenticated
using (user_id = auth.uid() or public.loop_is_platform_admin())
with check (user_id = auth.uid() or public.loop_is_platform_admin());

drop policy if exists "agenda self through profile" on public.loop_money_savings_agenda_items;
create policy "agenda self through profile" on public.loop_money_savings_agenda_items
for all to authenticated
using (
  exists(select 1 from public.loop_money_profiles p where p.id = profile_id and (p.user_id = auth.uid() or public.loop_is_platform_admin()))
)
with check (
  exists(select 1 from public.loop_money_profiles p where p.id = profile_id and (p.user_id = auth.uid() or public.loop_is_platform_admin()))
);

drop policy if exists "savings deals readable" on public.loop_money_savings_deals;
create policy "savings deals readable" on public.loop_money_savings_deals
for select to authenticated using (status in ('active','needs_review') or public.loop_is_platform_admin());

drop policy if exists "savings deals admin write" on public.loop_money_savings_deals;
create policy "savings deals admin write" on public.loop_money_savings_deals
for all to authenticated
using (public.loop_is_platform_admin())
with check (public.loop_is_platform_admin());

drop policy if exists "deal observations readable" on public.loop_money_deal_observations;
create policy "deal observations readable" on public.loop_money_deal_observations
for select to authenticated using (true);

drop policy if exists "deal observations admin write" on public.loop_money_deal_observations;
create policy "deal observations admin write" on public.loop_money_deal_observations
for all to authenticated
using (public.loop_is_platform_admin())
with check (public.loop_is_platform_admin());

drop policy if exists "opportunities self" on public.loop_money_strategy_opportunities;
create policy "opportunities self" on public.loop_money_strategy_opportunities
for all to authenticated
using (
  exists(select 1 from public.loop_money_profiles p where p.id = profile_id and (p.user_id = auth.uid() or public.loop_is_platform_admin()))
)
with check (
  exists(select 1 from public.loop_money_profiles p where p.id = profile_id and (p.user_id = auth.uid() or public.loop_is_platform_admin()))
);

drop policy if exists "money notifications self" on public.loop_money_notifications;
create policy "money notifications self" on public.loop_money_notifications
for all to authenticated
using (user_id = auth.uid() or public.loop_is_platform_admin())
with check (user_id = auth.uid() or public.loop_is_platform_admin());

drop policy if exists "deal refresh jobs admin" on public.loop_money_deal_refresh_jobs;
create policy "deal refresh jobs admin" on public.loop_money_deal_refresh_jobs
for all to authenticated
using (public.loop_is_platform_admin())
with check (public.loop_is_platform_admin());

-- ------------------------------------------------------------
-- Money calculations
-- ------------------------------------------------------------
drop function if exists public.loop_regular_saver_gross_interest_pence(integer, numeric, integer);
create or replace function public.loop_regular_saver_gross_interest_pence(
  p_monthly_pence integer,
  p_rate_aer numeric,
  p_months integer default 12
)
returns integer
language sql
immutable
set search_path = public, pg_catalog
as $$
  -- Approximation: monthly deposits accrue for months, months-1 ... 1.
  -- This is a comparison estimate, not guaranteed interest.
  select greatest(0, round(
    coalesce(p_monthly_pence,0)
    * (coalesce(p_rate_aer,0) / 100.0)
    / 12.0
    * (greatest(1, coalesce(p_months,12)) * (greatest(1, coalesce(p_months,12)) + 1) / 2.0)
  ))::integer;
$$;

grant execute on function public.loop_regular_saver_gross_interest_pence(integer, numeric, integer) to authenticated;

drop function if exists public.loop_money_deal_candidates(uuid);
create or replace function public.loop_money_deal_candidates(p_profile_id uuid)
returns table (
  deal_id uuid,
  provider_name text,
  product_name text,
  product_type text,
  rate_aer numeric,
  recommended_monthly_pence integer,
  remaining_monthly_pence integer,
  estimated_gross_interest_pence integer,
  estimated_incremental_gross_interest_pence integer,
  suitability_score integer,
  condition_warnings text[],
  reason text,
  opening_url text,
  source_url text,
  rate_last_checked_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_profile public.loop_money_profiles%rowtype;
  v_current_rate numeric;
begin
  select * into v_profile
  from public.loop_money_profiles p
  where p.id = p_profile_id
    and (p.user_id = auth.uid() or public.loop_is_platform_admin());

  if v_profile.id is null then
    raise exception 'Money profile not found or not accessible.';
  end if;

  v_current_rate := coalesce(v_profile.existing_average_cash_rate_aer, 0);

  return query
  select
    d.id,
    d.provider_name,
    d.product_name,
    d.product_type,
    d.rate_aer,
    least(coalesce(d.max_monthly_pence, v_profile.monthly_available_savings_pence), v_profile.monthly_available_savings_pence) as recommended_monthly_pence,
    greatest(0, v_profile.monthly_available_savings_pence - least(coalesce(d.max_monthly_pence, v_profile.monthly_available_savings_pence), v_profile.monthly_available_savings_pence)) as remaining_monthly_pence,
    public.loop_regular_saver_gross_interest_pence(
      least(coalesce(d.max_monthly_pence, v_profile.monthly_available_savings_pence), v_profile.monthly_available_savings_pence),
      d.rate_aer,
      coalesce(d.term_months, 12)
    ) as estimated_gross_interest_pence,
    public.loop_regular_saver_gross_interest_pence(
      least(coalesce(d.max_monthly_pence, v_profile.monthly_available_savings_pence), v_profile.monthly_available_savings_pence),
      greatest(0, d.rate_aer - v_current_rate),
      coalesce(d.term_months, 12)
    ) as estimated_incremental_gross_interest_pence,
    greatest(
      0,
      least(
        100,
        50
        + case when d.rate_aer > v_current_rate then 20 else -10 end
        + case when d.max_monthly_pence is null or d.max_monthly_pence >= least(v_profile.monthly_available_savings_pence, 20000) then 10 else 0 end
        + case when d.requires_switch then -15 else 0 end
        + case when d.requires_current_account then -8 else 0 end
        + case when d.access_type = 'easy_access' then 8 when d.access_type = 'restricted' then -3 else 0 end
      )
    )::integer as suitability_score,
    array_remove(array[
      case when d.requires_current_account then 'Requires a linked/current account' end,
      case when d.requires_switch then 'May require a current account switch' end,
      case when d.requires_direct_debits then 'May require direct debits' end,
      case when d.requires_min_monthly_pay_in then 'May require minimum monthly pay-in' end,
      case when d.new_customers_only then 'May be new customers only' end,
      case when d.max_monthly_pence is not null and d.max_monthly_pence < v_profile.monthly_available_savings_pence then 'Only part of your monthly savings fits this deal' end,
      case when d.rate_last_checked_at is null or d.rate_last_checked_at < now() - interval '21 days' then 'Rate needs checking' end
    ], null)::text[] as condition_warnings,
    case
      when d.rate_aer > v_current_rate and d.max_monthly_pence is not null
        then 'Higher-rate option for up to ' || trim(to_char(d.max_monthly_pence / 100.0, 'FM£999,999,990.00')) || ' per month; use remaining money elsewhere.'
      when d.rate_aer > v_current_rate
        then 'Higher-rate option than your current average cash rate.'
      else 'Available product, but it may not beat your current average rate.'
    end as reason,
    d.opening_url,
    d.source_url,
    d.rate_last_checked_at
  from public.loop_money_savings_deals d
  where d.status = 'active'
    and d.rate_aer is not null
    and (d.min_monthly_pence is null or d.min_monthly_pence <= v_profile.monthly_available_savings_pence)
  order by
    public.loop_regular_saver_gross_interest_pence(
      least(coalesce(d.max_monthly_pence, v_profile.monthly_available_savings_pence), v_profile.monthly_available_savings_pence),
      greatest(0, d.rate_aer - v_current_rate),
      coalesce(d.term_months, 12)
    ) desc,
    d.rate_aer desc;
end;
$$;

grant execute on function public.loop_money_deal_candidates(uuid) to authenticated;

drop function if exists public.loop_money_generate_opportunities(uuid);
create or replace function public.loop_money_generate_opportunities(p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_count integer := 0;
  v_user_id uuid;
  r record;
begin
  select user_id into v_user_id
  from public.loop_money_profiles
  where id = p_profile_id
    and (user_id = auth.uid() or public.loop_is_platform_admin());

  if v_user_id is null then
    raise exception 'Money profile not found or not accessible.';
  end if;

  for r in select * from public.loop_money_deal_candidates(p_profile_id) limit 10 loop
    insert into public.loop_money_strategy_opportunities(
      profile_id,
      deal_id,
      recommended_monthly_pence,
      remaining_monthly_pence,
      estimated_gross_interest_pence,
      estimated_incremental_gross_interest_pence,
      comparison_months,
      current_rate_aer,
      candidate_rate_aer,
      suitability_score,
      reason,
      condition_warnings,
      payload
    )
    values (
      p_profile_id,
      r.deal_id,
      r.recommended_monthly_pence,
      r.remaining_monthly_pence,
      r.estimated_gross_interest_pence,
      r.estimated_incremental_gross_interest_pence,
      12,
      null,
      r.rate_aer,
      r.suitability_score,
      r.reason,
      r.condition_warnings,
      to_jsonb(r)
    )
    on conflict do nothing;

    if coalesce(r.estimated_incremental_gross_interest_pence, 0) > 0 and r.suitability_score >= 60 then
      insert into public.loop_money_notifications(
        user_id,
        profile_id,
        notification_kind,
        title,
        body,
        action_url,
        payload
      )
      values (
        v_user_id,
        p_profile_id,
        'better_savings_deal',
        'Potential better savings deal found',
        r.provider_name || ' ' || r.product_name || ' could use ' || trim(to_char(r.recommended_monthly_pence / 100.0, 'FM£999,999,990.00')) || ' per month. Check conditions before acting.',
        '/account/money-strategy',
        to_jsonb(r)
      );
    end if;

    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('ok', true, 'created_or_checked', v_count);
end;
$$;

grant execute on function public.loop_money_generate_opportunities(uuid) to authenticated;

-- ------------------------------------------------------------
-- Seed example/manual deal schema only
-- ------------------------------------------------------------
insert into public.loop_money_savings_deals(
  provider_name,
  product_name,
  product_type,
  rate_aer,
  rate_type,
  max_monthly_pence,
  term_months,
  access_type,
  requires_current_account,
  eligibility_notes,
  source_provider,
  source_confidence,
  status
)
select
  'Example Bank',
  'Example Regular Saver',
  'regular_saver',
  5.00,
  'variable',
  20000,
  12,
  'restricted',
  true,
  'Example row only. Replace with real/admin-verified deals before showing users.',
  'manual',
  20,
  'draft'
where not exists (
  select 1 from public.loop_money_savings_deals where provider_name = 'Example Bank' and product_name = 'Example Regular Saver'
);

-- ------------------------------------------------------------
-- Healthcheck
-- ------------------------------------------------------------
drop function if exists public.loop_v2772_admin_money_healthcheck();
create or replace function public.loop_v2772_admin_money_healthcheck()
returns table(check_name text, ok boolean, detail text)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select 'admin_audit_table'::text,
    to_regclass('public.loop_admin_audit_events') is not null,
    'Admin audit event table exists.'
  union all
  select 'deployment_checks_table',
    to_regclass('public.loop_admin_deployment_checks') is not null,
    'Embedded admin deployment checklist exists.'
  union all
  select 'money_profiles_table',
    to_regclass('public.loop_money_profiles') is not null,
    'Money profiles table exists.'
  union all
  select 'savings_deals_table',
    to_regclass('public.loop_money_savings_deals') is not null,
    'Savings deal library exists.'
  union all
  select 'deal_observations_table',
    to_regclass('public.loop_money_deal_observations') is not null,
    'Savings deal observations/history exists.'
  union all
  select 'opportunity_table',
    to_regclass('public.loop_money_strategy_opportunities') is not null,
    'Money strategy opportunities table exists.'
  union all
  select 'regular_saver_math',
    public.loop_regular_saver_gross_interest_pence(20000, 8.0, 12) > 0,
    'Regular saver comparison estimate works.'
  union all
  select 'candidate_rpc',
    exists(select 1 from pg_proc where proname = 'loop_money_deal_candidates'),
    'Money deal candidate RPC exists.'
$$;

grant execute on function public.loop_v2772_admin_money_healthcheck() to anon;
grant execute on function public.loop_v2772_admin_money_healthcheck() to authenticated;


-- ============================================================
-- db/v27_73_money_daily_deal_watch.sql
-- ============================================================

-- v27.73 LOOP Money daily deal watch
--
-- Run after v27.72.
--
-- This adds the missing "8am daily deal watch" layer:
-- - daily run logs
-- - deal availability lifecycle
-- - withdrawal/unavailable detection fields
-- - source registry for provider/feed/comparison pages
-- - event history
-- - notification creation when deals are removed or better deals appear
--
-- Important:
-- The daily job can only check known source URLs / configured provider feeds.
-- It cannot truthfully capture every deal in the market unless those sources are added
-- via admin, affiliate feeds, open feeds or commercial data providers.

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

-- ------------------------------------------------------------
-- Extend savings deals
-- ------------------------------------------------------------
alter table public.loop_money_savings_deals
  add column if not exists availability_status text not null default 'available',
  add column if not exists unavailable_detected_at timestamptz,
  add column if not exists withdrawal_confirmed_at timestamptz,
  add column if not exists removed_reason text,
  add column if not exists consecutive_unavailable_checks integer not null default 0,
  add column if not exists consecutive_failed_checks integer not null default 0,
  add column if not exists last_successful_check_at timestamptz,
  add column if not exists last_check_status text,
  add column if not exists last_check_detail text,
  add column if not exists stale_after_at timestamptz,
  add column if not exists last_seen_available_at timestamptz,
  add column if not exists discovered_from_source_id uuid,
  add column if not exists public_visibility text not null default 'visible';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'loop_money_savings_deals_availability_check'
  ) then
    alter table public.loop_money_savings_deals
      add constraint loop_money_savings_deals_availability_check
      check (availability_status in ('available','suspected_withdrawn','withdrawn','blocked','unknown','needs_review'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'loop_money_savings_deals_visibility_check'
  ) then
    alter table public.loop_money_savings_deals
      add constraint loop_money_savings_deals_visibility_check
      check (public_visibility in ('visible','hidden','admin_only'));
  end if;
end $$;

create index if not exists loop_money_savings_deals_availability_idx
on public.loop_money_savings_deals(status, availability_status, public_visibility, rate_aer desc);

-- ------------------------------------------------------------
-- Deal source registry
-- ------------------------------------------------------------
create table if not exists public.loop_money_deal_sources (
  id uuid primary key default gen_random_uuid(),
  source_name text not null,
  source_kind text not null default 'source_url',
  source_url text not null,
  provider_name text,
  country_code text not null default 'GB',
  enabled boolean not null default true,
  check_frequency text not null default 'daily',
  trust_level integer not null default 50,
  last_checked_at timestamptz,
  last_success_at timestamptz,
  last_status text,
  last_error text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loop_money_deal_sources_kind_check check (source_kind in ('bank_page','comparison_page','affiliate_feed','provider_feed','manual_csv','source_url','commercial_api')),
  constraint loop_money_deal_sources_frequency_check check (check_frequency in ('hourly','daily','weekly','manual')),
  constraint loop_money_deal_sources_trust_check check (trust_level between 0 and 100)
);

create index if not exists loop_money_deal_sources_enabled_idx
on public.loop_money_deal_sources(enabled, check_frequency, last_checked_at);

drop trigger if exists loop_money_deal_sources_updated_at on public.loop_money_deal_sources;
create trigger loop_money_deal_sources_updated_at
before update on public.loop_money_deal_sources
for each row execute function public.loop_set_updated_at();

-- ------------------------------------------------------------
-- Daily run logs
-- ------------------------------------------------------------
create table if not exists public.loop_money_deal_daily_runs (
  id uuid primary key default gen_random_uuid(),
  run_key text not null unique,
  run_kind text not null default 'daily_8am',
  status text not null default 'started',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  checked_deals integer not null default 0,
  available_count integer not null default 0,
  suspected_withdrawn_count integer not null default 0,
  withdrawn_count integer not null default 0,
  blocked_count integer not null default 0,
  failed_count integer not null default 0,
  new_deals_found integer not null default 0,
  opportunities_created integer not null default 0,
  notifications_created integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  error text,
  constraint loop_money_deal_daily_runs_status_check check (status in ('started','completed','completed_with_warnings','failed'))
);

create index if not exists loop_money_deal_daily_runs_started_idx
on public.loop_money_deal_daily_runs(started_at desc);

-- ------------------------------------------------------------
-- Availability / rate events
-- ------------------------------------------------------------
create table if not exists public.loop_money_deal_events (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references public.loop_money_savings_deals(id) on delete cascade,
  event_kind text not null,
  previous_status text,
  new_status text,
  previous_rate_aer numeric,
  new_rate_aer numeric,
  source_url text,
  detail text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint loop_money_deal_events_kind_check check (event_kind in ('available_confirmed','suspected_withdrawn','withdrawn','blocked','failed_check','rate_changed','new_deal','manual_review','stale'))
);

create index if not exists loop_money_deal_events_deal_idx
on public.loop_money_deal_events(deal_id, created_at desc);

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
alter table public.loop_money_deal_sources enable row level security;
alter table public.loop_money_deal_daily_runs enable row level security;
alter table public.loop_money_deal_events enable row level security;

drop policy if exists "money deal sources admin" on public.loop_money_deal_sources;
create policy "money deal sources admin" on public.loop_money_deal_sources
for all to authenticated
using (public.loop_is_platform_admin())
with check (public.loop_is_platform_admin());

drop policy if exists "money deal runs admin" on public.loop_money_deal_daily_runs;
create policy "money deal runs admin" on public.loop_money_deal_daily_runs
for select to authenticated
using (public.loop_is_platform_admin());

drop policy if exists "money deal events admin" on public.loop_money_deal_events;
create policy "money deal events admin" on public.loop_money_deal_events
for select to authenticated
using (public.loop_is_platform_admin());

drop policy if exists "money deal events insert admin" on public.loop_money_deal_events;
create policy "money deal events insert admin" on public.loop_money_deal_events
for insert to authenticated
with check (public.loop_is_platform_admin());

-- ------------------------------------------------------------
-- Replace candidate logic so only currently available visible deals optimise money.
-- ------------------------------------------------------------
drop function if exists public.loop_money_deal_candidates(uuid);
create or replace function public.loop_money_deal_candidates(p_profile_id uuid)
returns table (
  deal_id uuid,
  provider_name text,
  product_name text,
  product_type text,
  rate_aer numeric,
  recommended_monthly_pence integer,
  remaining_monthly_pence integer,
  estimated_gross_interest_pence integer,
  estimated_incremental_gross_interest_pence integer,
  suitability_score integer,
  condition_warnings text[],
  reason text,
  opening_url text,
  source_url text,
  rate_last_checked_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_profile public.loop_money_profiles%rowtype;
  v_current_rate numeric;
begin
  select * into v_profile
  from public.loop_money_profiles p
  where p.id = p_profile_id
    and (p.user_id = auth.uid() or public.loop_is_platform_admin());

  if v_profile.id is null then
    raise exception 'Money profile not found or not accessible.';
  end if;

  v_current_rate := coalesce(v_profile.existing_average_cash_rate_aer, 0);

  return query
  select
    d.id,
    d.provider_name,
    d.product_name,
    d.product_type,
    d.rate_aer,
    least(coalesce(d.max_monthly_pence, v_profile.monthly_available_savings_pence), v_profile.monthly_available_savings_pence) as recommended_monthly_pence,
    greatest(0, v_profile.monthly_available_savings_pence - least(coalesce(d.max_monthly_pence, v_profile.monthly_available_savings_pence), v_profile.monthly_available_savings_pence)) as remaining_monthly_pence,
    public.loop_regular_saver_gross_interest_pence(
      least(coalesce(d.max_monthly_pence, v_profile.monthly_available_savings_pence), v_profile.monthly_available_savings_pence),
      d.rate_aer,
      coalesce(d.term_months, 12)
    ) as estimated_gross_interest_pence,
    public.loop_regular_saver_gross_interest_pence(
      least(coalesce(d.max_monthly_pence, v_profile.monthly_available_savings_pence), v_profile.monthly_available_savings_pence),
      greatest(0, d.rate_aer - v_current_rate),
      coalesce(d.term_months, 12)
    ) as estimated_incremental_gross_interest_pence,
    greatest(
      0,
      least(
        100,
        50
        + case when d.rate_aer > v_current_rate then 20 else -10 end
        + case when d.max_monthly_pence is null or d.max_monthly_pence >= least(v_profile.monthly_available_savings_pence, 20000) then 10 else 0 end
        + case when d.requires_switch then -15 else 0 end
        + case when d.requires_current_account then -8 else 0 end
        + case when d.access_type = 'easy_access' then 8 when d.access_type = 'restricted' then -3 else 0 end
        + case when d.rate_last_checked_at is not null and d.rate_last_checked_at > now() - interval '2 days' then 5 else -8 end
      )
    )::integer as suitability_score,
    array_remove(array[
      case when d.requires_current_account then 'Requires a linked/current account' end,
      case when d.requires_switch then 'May require a current account switch' end,
      case when d.requires_direct_debits then 'May require direct debits' end,
      case when d.requires_min_monthly_pay_in then 'May require minimum monthly pay-in' end,
      case when d.new_customers_only then 'May be new customers only' end,
      case when d.max_monthly_pence is not null and d.max_monthly_pence < v_profile.monthly_available_savings_pence then 'Only part of your monthly savings fits this deal' end,
      case when d.rate_last_checked_at is null or d.rate_last_checked_at < now() - interval '2 days' then 'Rate/source needs a fresh check before acting' end
    ], null)::text[] as condition_warnings,
    case
      when d.rate_aer > v_current_rate and d.max_monthly_pence is not null
        then 'Higher-rate option for up to ' || trim(to_char(d.max_monthly_pence / 100.0, 'FM£999,999,990.00')) || ' per month; use remaining money elsewhere.'
      when d.rate_aer > v_current_rate
        then 'Higher-rate option than your current average cash rate.'
      else 'Available product, but it may not beat your current average rate.'
    end as reason,
    d.opening_url,
    d.source_url,
    d.rate_last_checked_at
  from public.loop_money_savings_deals d
  where d.status = 'active'
    and d.availability_status = 'available'
    and d.public_visibility = 'visible'
    and d.rate_aer is not null
    and (d.stale_after_at is null or d.stale_after_at > now())
    and (d.min_monthly_pence is null or d.min_monthly_pence <= v_profile.monthly_available_savings_pence)
  order by
    public.loop_regular_saver_gross_interest_pence(
      least(coalesce(d.max_monthly_pence, v_profile.monthly_available_savings_pence), v_profile.monthly_available_savings_pence),
      greatest(0, d.rate_aer - v_current_rate),
      coalesce(d.term_months, 12)
    ) desc,
    d.rate_aer desc;
end;
$$;

grant execute on function public.loop_money_deal_candidates(uuid) to authenticated;

-- ------------------------------------------------------------
-- Status transition helper used by cron workers.
-- ------------------------------------------------------------
drop function if exists public.loop_money_apply_deal_check_result(uuid, text, numeric, text, jsonb);
create or replace function public.loop_money_apply_deal_check_result(
  p_deal_id uuid,
  p_check_status text,
  p_rate_aer numeric default null,
  p_detail text default null,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  d public.loop_money_savings_deals%rowtype;
  v_old_status text;
  v_old_rate numeric;
  v_new_status text;
  v_availability text;
  v_visibility text;
  v_consecutive_unavailable integer;
  v_consecutive_failed integer;
  v_event text;
begin
  select * into d from public.loop_money_savings_deals where id = p_deal_id for update;

  if d.id is null then
    raise exception 'Deal not found.';
  end if;

  v_old_status := d.status;
  v_old_rate := d.rate_aer;
  v_new_status := d.status;
  v_availability := d.availability_status;
  v_visibility := d.public_visibility;
  v_consecutive_unavailable := coalesce(d.consecutive_unavailable_checks, 0);
  v_consecutive_failed := coalesce(d.consecutive_failed_checks, 0);

  if p_check_status = 'available' then
    v_new_status := 'active';
    v_availability := 'available';
    v_visibility := 'visible';
    v_consecutive_unavailable := 0;
    v_consecutive_failed := 0;
    v_event := case when p_rate_aer is not null and p_rate_aer <> d.rate_aer then 'rate_changed' else 'available_confirmed' end;

    update public.loop_money_savings_deals
    set
      status = v_new_status,
      availability_status = v_availability,
      public_visibility = v_visibility,
      rate_aer = coalesce(p_rate_aer, rate_aer),
      last_successful_check_at = now(),
      last_seen_available_at = now(),
      rate_last_checked_at = now(),
      last_check_status = p_check_status,
      last_check_detail = p_detail,
      stale_after_at = now() + interval '3 days',
      consecutive_unavailable_checks = v_consecutive_unavailable,
      consecutive_failed_checks = v_consecutive_failed,
      source_confidence = greatest(coalesce(source_confidence, 0), coalesce((p_payload ->> 'confidence')::integer, 60)),
      updated_at = now()
    where id = p_deal_id;

  elsif p_check_status in ('withdrawn','unavailable','not_found') then
    v_consecutive_unavailable := v_consecutive_unavailable + 1;
    v_consecutive_failed := 0;
    v_event := case when v_consecutive_unavailable >= 2 then 'withdrawn' else 'suspected_withdrawn' end;
    v_new_status := case when v_consecutive_unavailable >= 2 then 'withdrawn' else 'needs_review' end;
    v_availability := case when v_consecutive_unavailable >= 2 then 'withdrawn' else 'suspected_withdrawn' end;
    v_visibility := 'hidden';

    update public.loop_money_savings_deals
    set
      status = v_new_status,
      availability_status = v_availability,
      public_visibility = v_visibility,
      unavailable_detected_at = coalesce(unavailable_detected_at, now()),
      withdrawal_confirmed_at = case when v_consecutive_unavailable >= 2 then now() else withdrawal_confirmed_at end,
      removed_reason = coalesce(p_detail, 'Source no longer shows this deal.'),
      last_check_status = p_check_status,
      last_check_detail = p_detail,
      rate_last_checked_at = now(),
      stale_after_at = now(),
      consecutive_unavailable_checks = v_consecutive_unavailable,
      consecutive_failed_checks = v_consecutive_failed,
      updated_at = now()
    where id = p_deal_id;

  elsif p_check_status in ('blocked','rate_limited') then
    v_consecutive_failed := v_consecutive_failed + 1;
    v_event := 'blocked';
    v_new_status := 'needs_review';
    v_availability := 'blocked';
    v_visibility := 'hidden';

    update public.loop_money_savings_deals
    set
      status = v_new_status,
      availability_status = v_availability,
      public_visibility = v_visibility,
      last_check_status = p_check_status,
      last_check_detail = p_detail,
      rate_last_checked_at = now(),
      stale_after_at = now(),
      consecutive_failed_checks = v_consecutive_failed,
      updated_at = now()
    where id = p_deal_id;

  else
    v_consecutive_failed := v_consecutive_failed + 1;
    v_event := 'failed_check';
    v_visibility := case when v_consecutive_failed >= 2 then 'hidden' else public_visibility end;
    v_new_status := case when v_consecutive_failed >= 2 then 'needs_review' else status end;
    v_availability := case when v_consecutive_failed >= 2 then 'unknown' else availability_status end;

    update public.loop_money_savings_deals
    set
      status = v_new_status,
      availability_status = v_availability,
      public_visibility = v_visibility,
      last_check_status = p_check_status,
      last_check_detail = p_detail,
      rate_last_checked_at = now(),
      stale_after_at = case when v_consecutive_failed >= 2 then now() else stale_after_at end,
      consecutive_failed_checks = v_consecutive_failed,
      updated_at = now()
    where id = p_deal_id;
  end if;

  insert into public.loop_money_deal_events(
    deal_id,
    event_kind,
    previous_status,
    new_status,
    previous_rate_aer,
    new_rate_aer,
    source_url,
    detail,
    payload
  )
  values (
    p_deal_id,
    v_event,
    v_old_status,
    v_new_status,
    v_old_rate,
    coalesce(p_rate_aer, d.rate_aer),
    d.source_url,
    p_detail,
    coalesce(p_payload, '{}'::jsonb)
  );

  return jsonb_build_object(
    'ok', true,
    'deal_id', p_deal_id,
    'event', v_event,
    'status', v_new_status,
    'availability_status', v_availability,
    'public_visibility', v_visibility,
    'consecutive_unavailable_checks', v_consecutive_unavailable,
    'consecutive_failed_checks', v_consecutive_failed
  );
end;
$$;

grant execute on function public.loop_money_apply_deal_check_result(uuid, text, numeric, text, jsonb) to authenticated;

-- ------------------------------------------------------------
-- Healthcheck
-- ------------------------------------------------------------
drop function if exists public.loop_v2773_money_daily_watch_healthcheck();
create or replace function public.loop_v2773_money_daily_watch_healthcheck()
returns table(check_name text, ok boolean, detail text)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select 'deal_sources_table'::text,
    to_regclass('public.loop_money_deal_sources') is not null,
    'Deal source registry exists.'
  union all
  select 'daily_runs_table',
    to_regclass('public.loop_money_deal_daily_runs') is not null,
    'Daily run logs table exists.'
  union all
  select 'deal_events_table',
    to_regclass('public.loop_money_deal_events') is not null,
    'Deal event history table exists.'
  union all
  select 'availability_columns',
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'loop_money_savings_deals'
        and column_name = 'availability_status'
    ),
    'Savings deals include availability lifecycle columns.'
  union all
  select 'apply_result_rpc',
    exists(select 1 from pg_proc where proname = 'loop_money_apply_deal_check_result'),
    'Cron status transition RPC exists.'
  union all
  select 'candidate_filtering',
    exists(select 1 from pg_proc where proname = 'loop_money_deal_candidates'),
    'Candidate RPC exists and filters hidden/unavailable deals.'
$$;

grant execute on function public.loop_v2773_money_daily_watch_healthcheck() to anon;
grant execute on function public.loop_v2773_money_daily_watch_healthcheck() to authenticated;


-- ============================================================
-- db/v27_74_admin_ops_assets.sql
-- ============================================================

-- v27.74 Admin Operations Centre + Property/Vehicle household assets
--
-- Run after v27.72/v27.73.
--
-- Adds:
-- - Admin notifications/attention centre
-- - Admin uptime checker
-- - User issue reporting
-- - Product quality snapshot + tile checks
-- - Investment coverage/SnapTrade monitoring
-- - System continuity alerts
-- - Deal unknown/news review queue
-- - Household property and vehicle assets

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

create or replace function public.loop_is_platform_admin()
returns boolean
language sql
stable
set search_path = public, pg_catalog
as $$
  select
    coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin', '') = 'true'
    or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','owner','super_admin')
    or coalesce(auth.jwt() -> 'user_metadata' ->> 'loop_admin', '') = 'true';
$$;

grant execute on function public.loop_is_platform_admin() to authenticated;

-- ------------------------------------------------------------
-- Admin unified attention centre
-- ------------------------------------------------------------
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
  updated_at timestamptz not null default now(),
  constraint loop_admin_alerts_area_check check (area in (
    'deals','user_issues','products','investment_manual','investment_snaptrade',
    'system_continuity','uptime','households','auth','cron','security','assets','other'
  )),
  constraint loop_admin_alerts_severity_check check (severity in ('low','medium','high','critical')),
  constraint loop_admin_alerts_status_check check (status in ('open','watching','needs_admin_review','in_progress','resolved','dismissed'))
);

create index if not exists loop_admin_alerts_area_status_idx
on public.loop_admin_alerts(area, status, severity, last_seen_at desc);

create index if not exists loop_admin_alerts_next_check_idx
on public.loop_admin_alerts(status, next_check_at)
where status in ('open','watching','needs_admin_review','in_progress');

create unique index if not exists loop_admin_alerts_open_dedupe_idx
on public.loop_admin_alerts(dedupe_key)
where status in ('open','watching','needs_admin_review','in_progress');

drop trigger if exists loop_admin_alerts_updated_at on public.loop_admin_alerts;
create trigger loop_admin_alerts_updated_at
before update on public.loop_admin_alerts
for each row execute function public.loop_set_updated_at();

create table if not exists public.loop_admin_alert_events (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid references public.loop_admin_alerts(id) on delete cascade,
  event_kind text not null,
  note text,
  actor_user_id uuid references auth.users(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists loop_admin_alert_events_alert_idx
on public.loop_admin_alert_events(alert_id, created_at desc);

-- ------------------------------------------------------------
-- User issue reporting
-- ------------------------------------------------------------
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
  resolved_at timestamptz,
  constraint loop_user_issue_reports_severity_check check (severity in ('low','medium','high','critical')),
  constraint loop_user_issue_reports_status_check check (status in ('new','triaged','in_progress','waiting_user','resolved','closed'))
);

create index if not exists loop_user_issue_reports_status_idx
on public.loop_user_issue_reports(issue_area, status, created_at desc);

drop trigger if exists loop_user_issue_reports_updated_at on public.loop_user_issue_reports;
create trigger loop_user_issue_reports_updated_at
before update on public.loop_user_issue_reports
for each row execute function public.loop_set_updated_at();

-- ------------------------------------------------------------
-- Uptime checker
-- ------------------------------------------------------------
create table if not exists public.loop_uptime_targets (
  id uuid primary key default gen_random_uuid(),
  target_name text not null,
  target_url text not null,
  area text not null default 'system_continuity',
  expected_status_min integer not null default 200,
  expected_status_max integer not null default 399,
  enabled boolean not null default true,
  check_frequency_minutes integer not null default 15,
  timeout_ms integer not null default 8000,
  last_status text,
  last_status_code integer,
  last_latency_ms integer,
  last_checked_at timestamptz,
  last_success_at timestamptz,
  consecutive_failures integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists loop_uptime_targets_enabled_idx
on public.loop_uptime_targets(enabled, last_checked_at);

drop trigger if exists loop_uptime_targets_updated_at on public.loop_uptime_targets;
create trigger loop_uptime_targets_updated_at
before update on public.loop_uptime_targets
for each row execute function public.loop_set_updated_at();

create table if not exists public.loop_uptime_checks (
  id uuid primary key default gen_random_uuid(),
  target_id uuid references public.loop_uptime_targets(id) on delete cascade,
  status text not null,
  status_code integer,
  latency_ms integer,
  error text,
  checked_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  constraint loop_uptime_checks_status_check check (status in ('up','down','slow','failed','skipped'))
);

create index if not exists loop_uptime_checks_target_idx
on public.loop_uptime_checks(target_id, checked_at desc);

-- ------------------------------------------------------------
-- Product quality checks
-- ------------------------------------------------------------
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
  updated_at timestamptz not null default now(),
  unique(card_id)
);

create index if not exists loop_product_quality_status_idx
on public.loop_product_quality_snapshots(status, quality_score, last_checked_at desc);

drop trigger if exists loop_product_quality_snapshots_updated_at on public.loop_product_quality_snapshots;
create trigger loop_product_quality_snapshots_updated_at
before update on public.loop_product_quality_snapshots
for each row execute function public.loop_set_updated_at();

-- ------------------------------------------------------------
-- Investment coverage monitoring
-- ------------------------------------------------------------
create table if not exists public.loop_investment_markets (
  id uuid primary key default gen_random_uuid(),
  market_code text not null unique,
  market_name text not null,
  country_code text,
  currency_code text,
  enabled boolean not null default true,
  coverage_status text not null default 'planned',
  requested_by uuid references auth.users(id) on delete set null,
  requested_reason text,
  ai_next_update_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loop_investment_markets_status_check check (coverage_status in ('planned','manual','api_connected','needs_review','disabled'))
);

drop trigger if exists loop_investment_markets_updated_at on public.loop_investment_markets;
create trigger loop_investment_markets_updated_at
before update on public.loop_investment_markets
for each row execute function public.loop_set_updated_at();

create table if not exists public.loop_investment_coverage_sources (
  id uuid primary key default gen_random_uuid(),
  source_name text not null,
  source_kind text not null default 'manual_site',
  source_url text,
  markets text[] not null default array[]::text[],
  checks_stocks boolean not null default true,
  check_frequency_minutes integer not null default 1440,
  enabled boolean not null default true,
  last_checked_at timestamptz,
  last_success_at timestamptz,
  last_status text,
  last_error text,
  stocks_referenced integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loop_investment_coverage_sources_kind_check check (source_kind in ('manual_site','api','commercial_feed','snaptrade','admin_list','other'))
);

create index if not exists loop_investment_coverage_sources_enabled_idx
on public.loop_investment_coverage_sources(enabled, last_checked_at);

drop trigger if exists loop_investment_coverage_sources_updated_at on public.loop_investment_coverage_sources;
create trigger loop_investment_coverage_sources_updated_at
before update on public.loop_investment_coverage_sources
for each row execute function public.loop_set_updated_at();

create table if not exists public.loop_investment_snaptrade_health (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'unknown',
  connections_checked integer not null default 0,
  successful_connections integer not null default 0,
  failed_connections integer not null default 0,
  last_error text,
  payload jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now(),
  constraint loop_investment_snaptrade_health_status_check check (status in ('ok','degraded','down','unknown','not_configured'))
);

create index if not exists loop_investment_snaptrade_health_checked_idx
on public.loop_investment_snaptrade_health(checked_at desc);

-- ------------------------------------------------------------
-- Deal news review / AI-search queue
-- ------------------------------------------------------------
create table if not exists public.loop_money_deal_news_reviews (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references public.loop_money_savings_deals(id) on delete cascade,
  provider_name text,
  product_name text,
  source_url text,
  reason text not null,
  status text not null default 'queued',
  search_query text,
  ai_summary text,
  evidence_urls jsonb not null default '[]'::jsonb,
  confidence integer not null default 0,
  admin_decision text,
  linked_alert_id uuid references public.loop_admin_alerts(id) on delete set null,
  queued_at timestamptz not null default now(),
  checked_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint loop_money_deal_news_reviews_status_check check (status in ('queued','checking','needs_admin_review','confirmed_removed','confirmed_available','failed','dismissed'))
);

create index if not exists loop_money_deal_news_reviews_status_idx
on public.loop_money_deal_news_reviews(status, queued_at);

drop trigger if exists loop_money_deal_news_reviews_updated_at on public.loop_money_deal_news_reviews;
create trigger loop_money_deal_news_reviews_updated_at
before update on public.loop_money_deal_news_reviews
for each row execute function public.loop_set_updated_at();

-- ------------------------------------------------------------
-- Household property / vehicle assets
-- ------------------------------------------------------------
create table if not exists public.loop_household_properties (
  id uuid primary key default gen_random_uuid(),
  household_id uuid,
  owner_user_id uuid references auth.users(id) on delete set null,
  label text not null default 'Property',
  address_line1 text,
  address_line2 text,
  town_city text,
  county text,
  postcode text,
  country_code text not null default 'GB',
  latitude numeric,
  longitude numeric,
  map_image_url text,
  satellite_image_url text,
  property_type text,
  tenure text,
  bedrooms integer,
  bathrooms integer,
  estimated_value_pence integer,
  epc_rating text,
  epc_score integer,
  epc_potential_rating text,
  heating_cost_estimate_annual_pence integer,
  council_tax_band text,
  council_tax_annual_pence integer,
  insurance_estimate_annual_pence integer,
  schools_summary jsonb not null default '{}'::jsonb,
  commute_summary jsonb not null default '{}'::jsonb,
  source_status jsonb not null default '{}'::jsonb,
  enrichment_status text not null default 'not_started',
  last_enriched_at timestamptz,
  notes text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loop_household_properties_enrichment_check check (enrichment_status in ('not_started','queued','enriched','partial','needs_review','failed')),
  constraint loop_household_properties_status_check check (status in ('active','watching','archived','deleted'))
);

create index if not exists loop_household_properties_household_idx
on public.loop_household_properties(household_id, status);

create index if not exists loop_household_properties_owner_idx
on public.loop_household_properties(owner_user_id, status);

drop trigger if exists loop_household_properties_updated_at on public.loop_household_properties;
create trigger loop_household_properties_updated_at
before update on public.loop_household_properties
for each row execute function public.loop_set_updated_at();

create table if not exists public.loop_household_vehicles (
  id uuid primary key default gen_random_uuid(),
  household_id uuid,
  owner_user_id uuid references auth.users(id) on delete set null,
  label text not null default 'Car',
  registration text,
  make text,
  model text,
  variant text,
  fuel_type text,
  transmission text,
  year integer,
  annual_mileage integer,
  average_mpg numeric,
  electricity_kwh_per_mile numeric,
  fuel_price_pence_per_litre integer,
  electricity_price_pence_per_kwh integer,
  monthly_finance_pence integer,
  insurance_estimate_annual_pence integer,
  tax_annual_pence integer,
  mot_annual_pence integer,
  maintenance_annual_pence integer,
  running_cost_estimate_annual_pence integer,
  running_cost_estimate_per_mile_pence numeric,
  source_status jsonb not null default '{}'::jsonb,
  enrichment_status text not null default 'not_started',
  last_enriched_at timestamptz,
  notes text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loop_household_vehicles_enrichment_check check (enrichment_status in ('not_started','queued','enriched','partial','needs_review','failed')),
  constraint loop_household_vehicles_status_check check (status in ('active','watching','archived','deleted'))
);

create index if not exists loop_household_vehicles_household_idx
on public.loop_household_vehicles(household_id, status);

drop trigger if exists loop_household_vehicles_updated_at on public.loop_household_vehicles;
create trigger loop_household_vehicles_updated_at
before update on public.loop_household_vehicles
for each row execute function public.loop_set_updated_at();

create table if not exists public.loop_vehicle_journey_estimates (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid references public.loop_household_vehicles(id) on delete cascade,
  household_id uuid,
  user_id uuid references auth.users(id) on delete set null,
  journey_date date,
  start_label text,
  end_label text,
  estimated_miles numeric not null,
  estimated_cost_pence integer,
  source_kind text not null default 'manual',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint loop_vehicle_journey_estimates_source_check check (source_kind in ('manual','gps_estimate','map_route','calendar','other'))
);

create index if not exists loop_vehicle_journey_estimates_vehicle_idx
on public.loop_vehicle_journey_estimates(vehicle_id, journey_date desc);

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
alter table public.loop_admin_alerts enable row level security;
alter table public.loop_admin_alert_events enable row level security;
alter table public.loop_user_issue_reports enable row level security;
alter table public.loop_uptime_targets enable row level security;
alter table public.loop_uptime_checks enable row level security;
alter table public.loop_product_quality_snapshots enable row level security;
alter table public.loop_investment_markets enable row level security;
alter table public.loop_investment_coverage_sources enable row level security;
alter table public.loop_investment_snaptrade_health enable row level security;
alter table public.loop_money_deal_news_reviews enable row level security;
alter table public.loop_household_properties enable row level security;
alter table public.loop_household_vehicles enable row level security;
alter table public.loop_vehicle_journey_estimates enable row level security;

drop policy if exists "admin alerts admin" on public.loop_admin_alerts;
create policy "admin alerts admin" on public.loop_admin_alerts for all to authenticated
using (public.loop_is_platform_admin()) with check (public.loop_is_platform_admin());

drop policy if exists "admin alert events admin" on public.loop_admin_alert_events;
create policy "admin alert events admin" on public.loop_admin_alert_events for all to authenticated
using (public.loop_is_platform_admin()) with check (public.loop_is_platform_admin());

drop policy if exists "issue reports own insert" on public.loop_user_issue_reports;
create policy "issue reports own insert" on public.loop_user_issue_reports for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "issue reports own read admin read" on public.loop_user_issue_reports;
create policy "issue reports own read admin read" on public.loop_user_issue_reports for select to authenticated
using (user_id = auth.uid() or public.loop_is_platform_admin());

drop policy if exists "issue reports admin update" on public.loop_user_issue_reports;
create policy "issue reports admin update" on public.loop_user_issue_reports for update to authenticated
using (public.loop_is_platform_admin()) with check (public.loop_is_platform_admin());

drop policy if exists "uptime targets admin" on public.loop_uptime_targets;
create policy "uptime targets admin" on public.loop_uptime_targets for all to authenticated
using (public.loop_is_platform_admin()) with check (public.loop_is_platform_admin());

drop policy if exists "uptime checks admin" on public.loop_uptime_checks;
create policy "uptime checks admin" on public.loop_uptime_checks for all to authenticated
using (public.loop_is_platform_admin()) with check (public.loop_is_platform_admin());

drop policy if exists "product qa admin" on public.loop_product_quality_snapshots;
create policy "product qa admin" on public.loop_product_quality_snapshots for all to authenticated
using (public.loop_is_platform_admin()) with check (public.loop_is_platform_admin());

drop policy if exists "investment markets admin read" on public.loop_investment_markets;
create policy "investment markets admin read" on public.loop_investment_markets for select to authenticated
using (public.loop_is_platform_admin());

drop policy if exists "investment markets admin write" on public.loop_investment_markets;
create policy "investment markets admin write" on public.loop_investment_markets for all to authenticated
using (public.loop_is_platform_admin()) with check (public.loop_is_platform_admin());

drop policy if exists "investment sources admin" on public.loop_investment_coverage_sources;
create policy "investment sources admin" on public.loop_investment_coverage_sources for all to authenticated
using (public.loop_is_platform_admin()) with check (public.loop_is_platform_admin());

drop policy if exists "snaptrade health admin" on public.loop_investment_snaptrade_health;
create policy "snaptrade health admin" on public.loop_investment_snaptrade_health for all to authenticated
using (public.loop_is_platform_admin()) with check (public.loop_is_platform_admin());

drop policy if exists "deal news admin" on public.loop_money_deal_news_reviews;
create policy "deal news admin" on public.loop_money_deal_news_reviews for all to authenticated
using (public.loop_is_platform_admin()) with check (public.loop_is_platform_admin());

-- Asset policies: owner/admin. Household-member helper may exist in prior migrations; keep owner/admin safe fallback.
drop policy if exists "properties owner admin" on public.loop_household_properties;
create policy "properties owner admin" on public.loop_household_properties for all to authenticated
using (owner_user_id = auth.uid() or public.loop_is_platform_admin())
with check (owner_user_id = auth.uid() or public.loop_is_platform_admin());

drop policy if exists "vehicles owner admin" on public.loop_household_vehicles;
create policy "vehicles owner admin" on public.loop_household_vehicles for all to authenticated
using (owner_user_id = auth.uid() or public.loop_is_platform_admin())
with check (owner_user_id = auth.uid() or public.loop_is_platform_admin());

drop policy if exists "vehicle journeys owner admin" on public.loop_vehicle_journey_estimates;
create policy "vehicle journeys owner admin" on public.loop_vehicle_journey_estimates for all to authenticated
using (user_id = auth.uid() or public.loop_is_platform_admin())
with check (user_id = auth.uid() or public.loop_is_platform_admin());

-- ------------------------------------------------------------
-- Admin alert helpers
-- ------------------------------------------------------------
drop function if exists public.loop_admin_raise_alert(text, text, text, text, text, text, text, text, text, jsonb, integer);
create or replace function public.loop_admin_raise_alert(
  p_area text,
  p_severity text,
  p_alert_key text,
  p_title text,
  p_summary text default null,
  p_detail text default null,
  p_entity_kind text default null,
  p_entity_id text default null,
  p_action_url text default null,
  p_payload jsonb default '{}'::jsonb,
  p_check_cadence_minutes integer default 1440
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_id uuid;
  v_dedupe text := p_area || ':' || p_alert_key || ':' || coalesce(p_entity_kind,'') || ':' || coalesce(p_entity_id,'');
begin
  select id into v_id
  from public.loop_admin_alerts
  where dedupe_key = v_dedupe
    and status in ('open','watching','needs_admin_review','in_progress')
  limit 1;

  if v_id is not null then
    update public.loop_admin_alerts
    set
      severity = p_severity,
      title = p_title,
      summary = p_summary,
      detail = p_detail,
      entity_kind = p_entity_kind,
      entity_id = p_entity_id,
      action_url = p_action_url,
      payload = coalesce(p_payload, '{}'::jsonb),
      last_seen_at = now(),
      next_check_at = now() + make_interval(mins => coalesce(p_check_cadence_minutes, 1440)),
      check_cadence_minutes = coalesce(p_check_cadence_minutes, 1440),
      consecutive_failures = consecutive_failures + 1,
      updated_at = now()
    where id = v_id;

    insert into public.loop_admin_alert_events(alert_id, event_kind, note, payload)
    values (v_id, 'seen_again', p_summary, coalesce(p_payload, '{}'::jsonb));

    return v_id;
  end if;

  insert into public.loop_admin_alerts(
    area, severity, alert_key, title, summary, detail, entity_kind, entity_id, action_url,
    dedupe_key, payload, next_check_at, check_cadence_minutes
  )
  values (
    p_area, p_severity, p_alert_key, p_title, p_summary, p_detail, p_entity_kind, p_entity_id, p_action_url,
    v_dedupe, coalesce(p_payload, '{}'::jsonb), now() + make_interval(mins => coalesce(p_check_cadence_minutes, 1440)), coalesce(p_check_cadence_minutes, 1440)
  )
  returning id into v_id;

  insert into public.loop_admin_alert_events(alert_id, event_kind, note, payload)
  values (v_id, 'created', p_summary, coalesce(p_payload, '{}'::jsonb));

  return v_id;
end;
$$;

grant execute on function public.loop_admin_raise_alert(text, text, text, text, text, text, text, text, text, jsonb, integer) to authenticated;

drop function if exists public.loop_admin_attention_summary();
create or replace function public.loop_admin_attention_summary()
returns table(area text, open_count integer, high_count integer, critical_count integer, newest_at timestamptz)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select
    a.area,
    count(*)::integer as open_count,
    count(*) filter (where a.severity = 'high')::integer as high_count,
    count(*) filter (where a.severity = 'critical')::integer as critical_count,
    max(a.last_seen_at) as newest_at
  from public.loop_admin_alerts a
  where a.status in ('open','watching','needs_admin_review','in_progress')
  group by a.area
  order by
    count(*) filter (where a.severity = 'critical') desc,
    count(*) filter (where a.severity = 'high') desc,
    count(*) desc;
$$;

grant execute on function public.loop_admin_attention_summary() to authenticated;

drop function if exists public.loop_refresh_product_quality_snapshots();
create or replace function public.loop_refresh_product_quality_snapshots()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_count integer := 0;
begin
  if to_regclass('public.loop_nutrition_cards') is null then
    perform public.loop_admin_raise_alert(
      'products','high','product_table_missing','Product library table missing',
      'loop_nutrition_cards was not found.',
      'Product quality checks cannot run until the nutrition/product library migration is installed.',
      'table','loop_nutrition_cards','/admin/products/quality','{}'::jsonb, 60
    );
    return jsonb_build_object('ok', false, 'reason', 'loop_nutrition_cards missing');
  end if;

  execute $dyn$
    insert into public.loop_product_quality_snapshots(
      card_id, display_name, brand_name, product_type, source_provider, source_url, main_image_url,
      calories, confidence, has_image, has_nutrition, has_verified_source, has_serving,
      has_allergen_split, quality_score, missing_fields, status, last_checked_at
    )
    select
      c.id,
      c.display_name,
      c.brand_name,
      c.product_type,
      c.source_provider,
      c.source_url,
      c.main_image_url,
      c.calories,
      c.confidence,
      nullif(c.main_image_url, '') is not null as has_image,
      (c.calories is not null or coalesce(c.nutrition, '{}'::jsonb) <> '{}'::jsonb) as has_nutrition,
      (
        coalesce(c.source_provider,'') in ('admin_verified','manual_import','open_food_facts','retailer_source_url')
        or nullif(c.source_url,'') is not null
      ) as has_verified_source,
      (c.serving_g is not null or c.serving_ml is not null or nullif(c.serving_label,'') is not null) as has_serving,
      exists (
        select 1 from information_schema.tables
        where table_schema = 'public' and table_name = 'loop_nutrition_card_allergens'
      ) as has_allergen_split,
      (
        case when nullif(c.main_image_url, '') is not null then 20 else 0 end
        + case when (c.calories is not null or coalesce(c.nutrition, '{}'::jsonb) <> '{}'::jsonb) then 25 else 0 end
        + case when (coalesce(c.source_provider,'') <> '' or nullif(c.source_url,'') is not null) then 25 else 0 end
        + case when (c.serving_g is not null or c.serving_ml is not null or nullif(c.serving_label,'') is not null) then 15 else 0 end
        + case when coalesce(c.confidence,0) >= 70 then 15 else 0 end
      )::integer as quality_score,
      array_remove(array[
        case when nullif(c.main_image_url, '') is null then 'image' end,
        case when not (c.calories is not null or coalesce(c.nutrition, '{}'::jsonb) <> '{}'::jsonb) then 'nutrition' end,
        case when not (coalesce(c.source_provider,'') <> '' or nullif(c.source_url,'') is not null) then 'verified_source' end,
        case when not (c.serving_g is not null or c.serving_ml is not null or nullif(c.serving_label,'') is not null) then 'serving' end,
        case when coalesce(c.confidence,0) < 70 then 'confidence' end
      ], null)::text[] as missing_fields,
      case
        when (
          case when nullif(c.main_image_url, '') is not null then 20 else 0 end
          + case when (c.calories is not null or coalesce(c.nutrition, '{}'::jsonb) <> '{}'::jsonb) then 25 else 0 end
          + case when (coalesce(c.source_provider,'') <> '' or nullif(c.source_url,'') is not null) then 25 else 0 end
          + case when (c.serving_g is not null or c.serving_ml is not null or nullif(c.serving_label,'') is not null) then 15 else 0 end
          + case when coalesce(c.confidence,0) >= 70 then 15 else 0 end
        ) >= 85 then 'good'
        else 'needs_review'
      end as status,
      now()
    from public.loop_nutrition_cards c
    where coalesce(c.status,'active') = 'active'
      and coalesce(c.card_kind,'product') in ('product','ingredient')
    on conflict (card_id) do update set
      display_name = excluded.display_name,
      brand_name = excluded.brand_name,
      product_type = excluded.product_type,
      source_provider = excluded.source_provider,
      source_url = excluded.source_url,
      main_image_url = excluded.main_image_url,
      calories = excluded.calories,
      confidence = excluded.confidence,
      has_image = excluded.has_image,
      has_nutrition = excluded.has_nutrition,
      has_verified_source = excluded.has_verified_source,
      has_serving = excluded.has_serving,
      has_allergen_split = excluded.has_allergen_split,
      quality_score = excluded.quality_score,
      missing_fields = excluded.missing_fields,
      status = excluded.status,
      last_checked_at = now(),
      updated_at = now()
  $dyn$;

  get diagnostics v_count = row_count;

  insert into public.loop_admin_alerts(area, severity, alert_key, title, summary, entity_kind, entity_id, action_url, dedupe_key, payload, next_check_at)
  select
    'products',
    case when q.quality_score < 45 then 'high' else 'medium' end,
    'product_quality_missing',
    'Product needs data quality review',
    q.display_name || ' is missing: ' || array_to_string(q.missing_fields, ', '),
    'product',
    q.card_id::text,
    '/admin/products/quality',
    'products:product_quality_missing:product:' || q.card_id::text,
    to_jsonb(q),
    now() + interval '1 day'
  from public.loop_product_quality_snapshots q
  where q.status = 'needs_review'
    and not exists (
      select 1 from public.loop_admin_alerts a
      where a.dedupe_key = 'products:product_quality_missing:product:' || q.card_id::text
        and a.status in ('open','watching','needs_admin_review','in_progress')
    );

  return jsonb_build_object('ok', true, 'processed', v_count);
end;
$$;

grant execute on function public.loop_refresh_product_quality_snapshots() to authenticated;

drop function if exists public.loop_admin_refresh_attention_queue();
create or replace function public.loop_admin_refresh_attention_queue()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_product jsonb;
  r record;
begin
  v_product := public.loop_refresh_product_quality_snapshots();

  if to_regclass('public.loop_money_savings_deals') is not null then
    for r in execute $dyn$
      select id, provider_name, product_name, availability_status, last_check_status, last_check_detail
      from public.loop_money_savings_deals
      where status in ('needs_review','active')
        and coalesce(availability_status,'available') in ('blocked','unknown','suspected_withdrawn','needs_review')
    $dyn$ loop
      perform public.loop_admin_raise_alert(
        'deals',
        case when r.availability_status = 'blocked' then 'high' else 'medium' end,
        'deal_availability_review',
        'Savings deal needs review',
        r.provider_name || ' ' || r.product_name || ' is ' || coalesce(r.availability_status,'unknown'),
        coalesce(r.last_check_detail, 'Deal source could not be verified. Run AI/news check or review manually.'),
        'money_deal',
        r.id::text,
        '/admin/money-deals/daily-watch',
        to_jsonb(r),
        240
      );
    end loop;
  end if;

  for r in
    select *
    from public.loop_user_issue_reports
    where status in ('new','triaged','in_progress')
  loop
    perform public.loop_admin_raise_alert(
      'user_issues',
      case when r.severity in ('critical','high') then r.severity else 'medium' end,
      'user_issue_open',
      'User issue raised',
      r.title,
      r.description,
      'user_issue',
      r.id::text,
      '/admin/notifications?area=user_issues',
      to_jsonb(r),
      720
    );
  end loop;

  for r in
    select *
    from public.loop_uptime_targets
    where enabled = true
      and (
        consecutive_failures > 0
        or last_checked_at is null
        or last_checked_at < now() - make_interval(mins => check_frequency_minutes * 3)
      )
  loop
    perform public.loop_admin_raise_alert(
      'uptime',
      case when coalesce(r.consecutive_failures,0) >= 3 then 'critical' else 'high' end,
      'uptime_target_problem',
      'Uptime target needs attention',
      r.target_name || ' has not checked successfully.',
      coalesce(r.last_status,'No recent successful check.'),
      'uptime_target',
      r.id::text,
      '/admin/uptime',
      to_jsonb(r),
      greatest(5, r.check_frequency_minutes)
    );
  end loop;

  for r in
    select *
    from public.loop_investment_coverage_sources
    where enabled = true
      and (
        last_checked_at is null
        or last_success_at is null
        or last_checked_at < now() - make_interval(mins => check_frequency_minutes * 2)
        or coalesce(last_status,'') not in ('ok','success')
      )
  loop
    perform public.loop_admin_raise_alert(
      'investment_manual',
      'medium',
      'investment_source_stale',
      'Investment coverage source needs checking',
      r.source_name || ' needs a fresh check.',
      coalesce(r.last_error, 'Coverage source is stale or not yet checked.'),
      'investment_source',
      r.id::text,
      '/admin/investment-coverage',
      to_jsonb(r),
      greatest(60, r.check_frequency_minutes)
    );
  end loop;

  if exists (
    select 1 from public.loop_investment_snaptrade_health
    where checked_at > now() - interval '24 hours'
  ) then
    for r in
      select *
      from public.loop_investment_snaptrade_health
      order by checked_at desc
      limit 1
    loop
      if r.status in ('down','degraded','not_configured','unknown') then
        perform public.loop_admin_raise_alert(
          'investment_snaptrade',
          case when r.status = 'down' then 'critical' else 'high' end,
          'snaptrade_health_problem',
          'SnapTrade health needs attention',
          'Latest SnapTrade status: ' || r.status,
          coalesce(r.last_error, 'SnapTrade is not reporting as fully healthy.'),
          'snaptrade_health',
          r.id::text,
          '/admin/investment-coverage',
          to_jsonb(r),
          60
        );
      end if;
    end loop;
  else
    perform public.loop_admin_raise_alert(
      'investment_snaptrade',
      'medium',
      'snaptrade_health_missing',
      'SnapTrade health has not been checked',
      'No SnapTrade health record in the last 24 hours.',
      'Add a SnapTrade health check to the cron or mark as not configured.',
      'snaptrade_health',
      'missing',
      '/admin/investment-coverage',
      '{}'::jsonb,
      240
    );
  end if;

  -- System continuity checks: lightweight guards around separate profile/functionality layers.
  if to_regclass('public.loop_money_profiles') is not null then
    for r in execute $dyn$
      select id, user_id, profile_name
      from public.loop_money_profiles
      where status = 'active'
        and monthly_available_savings_pence is null
    $dyn$ loop
      perform public.loop_admin_raise_alert(
        'system_continuity','medium','money_profile_incomplete',
        'Money profile continuity issue',
        'An active money profile has missing savings amount.',
        'Profile logic may fail to calculate opportunities.',
        'money_profile', r.id::text, '/admin/notifications?area=system_continuity',
        to_jsonb(r), 1440
      );
    end loop;
  end if;

  return jsonb_build_object('ok', true, 'product_snapshot', v_product, 'refreshed_at', now());
end;
$$;

grant execute on function public.loop_admin_refresh_attention_queue() to authenticated;

drop function if exists public.loop_vehicle_recalculate_costs(uuid);
create or replace function public.loop_vehicle_recalculate_costs(p_vehicle_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v public.loop_household_vehicles%rowtype;
  fuel_annual_pence integer := 0;
  running_pence integer := 0;
  per_mile numeric := 0;
begin
  select * into v from public.loop_household_vehicles
  where id = p_vehicle_id
    and (owner_user_id = auth.uid() or public.loop_is_platform_admin());

  if v.id is null then
    raise exception 'Vehicle not found or not accessible.';
  end if;

  if coalesce(v.annual_mileage,0) > 0 then
    if coalesce(v.electricity_kwh_per_mile,0) > 0 then
      fuel_annual_pence := round(v.annual_mileage * v.electricity_kwh_per_mile * coalesce(v.electricity_price_pence_per_kwh, 28))::integer;
    elsif coalesce(v.average_mpg,0) > 0 then
      -- litres per mile = 4.54609 / mpg
      fuel_annual_pence := round(v.annual_mileage * (4.54609 / v.average_mpg) * coalesce(v.fuel_price_pence_per_litre, 145))::integer;
    end if;
  end if;

  running_pence :=
    coalesce(fuel_annual_pence,0)
    + coalesce(v.insurance_estimate_annual_pence,0)
    + coalesce(v.tax_annual_pence,0)
    + coalesce(v.mot_annual_pence,0)
    + coalesce(v.maintenance_annual_pence,0)
    + (coalesce(v.monthly_finance_pence,0) * 12);

  if coalesce(v.annual_mileage,0) > 0 then
    per_mile := round((running_pence::numeric / v.annual_mileage), 2);
  end if;

  update public.loop_household_vehicles
  set
    running_cost_estimate_annual_pence = running_pence,
    running_cost_estimate_per_mile_pence = per_mile,
    enrichment_status = 'enriched',
    last_enriched_at = now(),
    updated_at = now()
  where id = p_vehicle_id;

  return jsonb_build_object(
    'ok', true,
    'vehicle_id', p_vehicle_id,
    'fuel_or_energy_annual_pence', fuel_annual_pence,
    'running_cost_annual_pence', running_pence,
    'running_cost_per_mile_pence', per_mile
  );
end;
$$;

grant execute on function public.loop_vehicle_recalculate_costs(uuid) to authenticated;

drop function if exists public.loop_v2774_admin_ops_assets_healthcheck();
create or replace function public.loop_v2774_admin_ops_assets_healthcheck()
returns table(check_name text, ok boolean, detail text)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select 'admin_alerts'::text,
    to_regclass('public.loop_admin_alerts') is not null,
    'Unified admin alerts table exists.'
  union all
  select 'user_issue_reports',
    to_regclass('public.loop_user_issue_reports') is not null,
    'User issue reporting table exists.'
  union all
  select 'uptime_targets',
    to_regclass('public.loop_uptime_targets') is not null,
    'Uptime target/check tables exist.'
  union all
  select 'product_quality',
    to_regclass('public.loop_product_quality_snapshots') is not null,
    'Product quality snapshot table exists.'
  union all
  select 'investment_coverage',
    to_regclass('public.loop_investment_coverage_sources') is not null,
    'Investment coverage source table exists.'
  union all
  select 'deal_news_review',
    to_regclass('public.loop_money_deal_news_reviews') is not null,
    'Deal AI/news review queue exists.'
  union all
  select 'properties',
    to_regclass('public.loop_household_properties') is not null,
    'Household property asset table exists.'
  union all
  select 'vehicles',
    to_regclass('public.loop_household_vehicles') is not null,
    'Household vehicle asset table exists.'
  union all
  select 'attention_rpc',
    exists(select 1 from pg_proc where proname = 'loop_admin_refresh_attention_queue'),
    'Admin attention refresh RPC exists.'
$$;

grant execute on function public.loop_v2774_admin_ops_assets_healthcheck() to anon;
grant execute on function public.loop_v2774_admin_ops_assets_healthcheck() to authenticated;


-- ============================================================
-- db/v27_75_property_estimate_mode.sql
-- ============================================================

-- v27.75 Property estimate mode
create extension if not exists pgcrypto;

create or replace function public.loop_set_updated_at()
returns trigger language plpgsql set search_path = public, pg_catalog as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.loop_is_platform_admin()
returns boolean language sql stable set search_path = public, pg_catalog as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin', '') = 'true'
      or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','owner','super_admin')
      or coalesce(auth.jwt() -> 'user_metadata' ->> 'loop_admin', '') = 'true';
$$;

grant execute on function public.loop_is_platform_admin() to authenticated;

create table if not exists public.loop_household_properties (
  id uuid primary key default gen_random_uuid(),
  household_id uuid,
  owner_user_id uuid references auth.users(id) on delete set null,
  label text not null default 'Property',
  address_line1 text,
  town_city text,
  postcode text,
  country_code text not null default 'GB',
  latitude numeric,
  longitude numeric,
  property_type text,
  bedrooms integer,
  estimated_value_pence integer,
  source_status jsonb not null default '{}'::jsonb,
  enrichment_status text not null default 'not_started',
  last_enriched_at timestamptz,
  notes text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.loop_household_properties
  add column if not exists estimate_mode text not null default 'estimate_first',
  add column if not exists local_authority_name text,
  add column if not exists local_authority_code text,
  add column if not exists postcode_district text,
  add column if not exists region_name text,
  add column if not exists estimated_council_tax_band text,
  add column if not exists estimated_council_tax_band_low text,
  add column if not exists estimated_council_tax_band_high text,
  add column if not exists estimated_council_tax_annual_low_pence integer,
  add column if not exists estimated_council_tax_annual_high_pence integer,
  add column if not exists estimated_council_tax_annual_mid_pence integer,
  add column if not exists council_tax_estimate_confidence integer,
  add column if not exists council_tax_estimate_reason text,
  add column if not exists council_tax_estimate_status text not null default 'not_started',
  add column if not exists estimated_historic_value_pence integer,
  add column if not exists historic_value_basis text,
  add column if not exists comparable_sales_summary jsonb not null default '{}'::jsonb,
  add column if not exists nearby_sold_price_median_pence integer,
  add column if not exists nearby_sold_price_count integer,
  add column if not exists property_affordability_summary jsonb not null default '{}'::jsonb,
  add column if not exists source_confidence_summary jsonb not null default '{}'::jsonb,
  add column if not exists epc_rating text,
  add column if not exists heating_cost_estimate_annual_pence integer,
  add column if not exists council_tax_band text,
  add column if not exists council_tax_annual_pence integer,
  add column if not exists insurance_estimate_annual_pence integer,
  add column if not exists schools_summary jsonb not null default '{}'::jsonb;

create index if not exists loop_household_properties_postcode_idx on public.loop_household_properties(upper(coalesce(postcode,'')));

create table if not exists public.loop_property_data_sources (
  source_key text primary key,
  source_name text not null,
  source_area text not null,
  source_kind text not null,
  required_for_beta boolean not null default false,
  required_for_live boolean not null default false,
  account_needed boolean not null default false,
  env_keys text[] not null default array[]::text[],
  status text not null default 'not_started',
  setup_notes text not null,
  use_in_beta text not null,
  limitations text,
  sort_order integer not null default 100,
  updated_at timestamptz not null default now()
);

insert into public.loop_property_data_sources
(source_key, source_name, source_area, source_kind, required_for_beta, required_for_live, account_needed, env_keys, status, setup_notes, use_in_beta, limitations, sort_order)
values
('postcodes_io','Postcodes.io','postcode','open_api',true,true,false,array[]::text[],'planned','No account usually needed. Used for postcode validation, coordinates, admin district and region.','Use immediately for postcode/local authority inference.','Postcode-level, not exact address/UPRN.',10),
('ideal_postcodes','Ideal Postcodes','address','commercial_api',false,true,true,array['IDEAL_POSTCODES_API_KEY'],'not_started','Create an account for exact address lookup, UPRN and better property matching.','Optional. Beta can work from postcode + manual address.','Paid/commercial service.',20),
('hm_land_registry_ppd','HM Land Registry Price Paid Data','sold_prices','official_register',true,true,false,array[]::text[],'planned','Use open price-paid data for nearby comparable sold prices.','Use for rough comparables and affordability context.','Does not tell official council tax band; transaction data can lag.',30),
('epc_open_data','GOV.UK EPC Open Data','epc','official_register',false,true,true,array['UK_EPC_API_AUTH'],'not_started','Create/sign in with GOV.UK One Login for EPC API/bulk data.','Optional in beta. Show EPC as not configured or user-entered.','Certificates can be expired/replaced; exact address match can be messy.',40),
('google_maps','Google Maps Platform','maps','maps',false,true,true,array['GOOGLE_MAPS_API_KEY'],'not_started','Create Google Cloud project, enable maps/geocoding/static maps/routes and restrict API key.','Beta can use outbound map links only.','Requires billing and key restrictions.',50),
('dfe_schools','DfE / GOV.UK school data','schools','official_register',false,false,false,array[]::text[],'planned','Use public school performance/Ofsted/admissions sources where available.','Beta shows nearby-school summary/confidence only.','Catchment and oversubscription are not consistently available from one API.',60),
('insurance_affiliate','Home insurance partner feeds','insurance','affiliate',false,false,true,array['HOME_INSURANCE_PARTNER_KEY'],'not_needed_yet','Later commercial/affiliate integration for quotes/estimates.','Beta uses rough placeholders.','Accurate quotes require personal/property details and regulated flows.',70),
('dvla_vehicle','DVLA/MOT vehicle APIs','vehicles','official_register',false,false,true,array['DVLA_API_KEY','MOT_HISTORY_API_KEY'],'not_started','Useful for registration-based vehicle details and MOT history.','Manual car details are enough first.','Access/terms vary by API.',80),
('ai_property_research','AI property research fallback','council_tax','ai_research',true,true,true,array['OPENAI_API_KEY'],'planned','Use AI to summarise source evidence and explain confidence, not as the source of truth.','Use for reasoning text and admin review when incomplete.','Must label estimates clearly; do not present AI as official.',90)
on conflict (source_key) do update set
  status = excluded.status,
  setup_notes = excluded.setup_notes,
  use_in_beta = excluded.use_in_beta,
  limitations = excluded.limitations,
  env_keys = excluded.env_keys,
  updated_at = now();

create table if not exists public.loop_council_tax_band_rules (
  id uuid primary key default gen_random_uuid(),
  country_code text not null,
  valuation_date date not null,
  band text not null,
  min_value_pence integer,
  max_value_pence integer,
  sort_order integer not null,
  unique(country_code, band)
);

insert into public.loop_council_tax_band_rules(country_code, valuation_date, band, min_value_pence, max_value_pence, sort_order)
values
('ENG','1991-04-01','A',null,4000000,10),('ENG','1991-04-01','B',4000000,5200000,20),('ENG','1991-04-01','C',5200000,6800000,30),('ENG','1991-04-01','D',6800000,8800000,40),('ENG','1991-04-01','E',8800000,12000000,50),('ENG','1991-04-01','F',12000000,16000000,60),('ENG','1991-04-01','G',16000000,32000000,70),('ENG','1991-04-01','H',32000000,null,80),
('WLS','2003-04-01','A',null,4400000,10),('WLS','2003-04-01','B',4400000,6500000,20),('WLS','2003-04-01','C',6500000,9100000,30),('WLS','2003-04-01','D',9100000,12300000,40),('WLS','2003-04-01','E',12300000,16200000,50),('WLS','2003-04-01','F',16200000,22300000,60),('WLS','2003-04-01','G',22300000,32400000,70),('WLS','2003-04-01','H',32400000,42400000,80),('WLS','2003-04-01','I',42400000,null,90),
('SCT','1991-04-01','A',null,2700000,10),('SCT','1991-04-01','B',2700000,3500000,20),('SCT','1991-04-01','C',3500000,4500000,30),('SCT','1991-04-01','D',4500000,5800000,40),('SCT','1991-04-01','E',5800000,8000000,50),('SCT','1991-04-01','F',8000000,10600000,60),('SCT','1991-04-01','G',10600000,21200000,70),('SCT','1991-04-01','H',21200000,null,80)
on conflict (country_code, band) do nothing;

create table if not exists public.loop_council_tax_rate_estimates (
  id uuid primary key default gen_random_uuid(),
  local_authority_code text,
  local_authority_name text,
  country_code text not null default 'ENG',
  band text not null,
  annual_charge_pence integer not null,
  charge_year text not null default '2026/27',
  source_kind text not null default 'default_assumption',
  source_url text,
  confidence integer not null default 35,
  updated_at timestamptz not null default now()
);

create table if not exists public.loop_property_estimate_runs (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references public.loop_household_properties(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  household_id uuid,
  postcode text,
  address_text text,
  estimated_value_pence integer,
  property_type text,
  bedrooms integer,
  status text not null default 'completed',
  confidence integer not null default 0,
  result jsonb not null default '{}'::jsonb,
  sources_checked jsonb not null default '[]'::jsonb,
  warnings text[] not null default array[]::text[],
  created_at timestamptz not null default now()
);

alter table public.loop_property_data_sources enable row level security;
alter table public.loop_council_tax_band_rules enable row level security;
alter table public.loop_council_tax_rate_estimates enable row level security;
alter table public.loop_property_estimate_runs enable row level security;

drop policy if exists "property sources admin" on public.loop_property_data_sources;
create policy "property sources admin" on public.loop_property_data_sources for all to authenticated using (public.loop_is_platform_admin()) with check (public.loop_is_platform_admin());

drop policy if exists "band rules readable" on public.loop_council_tax_band_rules;
create policy "band rules readable" on public.loop_council_tax_band_rules for select to authenticated using (true);

drop policy if exists "rates readable" on public.loop_council_tax_rate_estimates;
create policy "rates readable" on public.loop_council_tax_rate_estimates for select to authenticated using (true);

drop policy if exists "rates admin write" on public.loop_council_tax_rate_estimates;
create policy "rates admin write" on public.loop_council_tax_rate_estimates for all to authenticated using (public.loop_is_platform_admin()) with check (public.loop_is_platform_admin());

drop policy if exists "estimate runs owner admin" on public.loop_property_estimate_runs;
create policy "estimate runs owner admin" on public.loop_property_estimate_runs for all to authenticated
using (user_id = auth.uid() or public.loop_is_platform_admin())
with check (user_id = auth.uid() or public.loop_is_platform_admin());

drop function if exists public.loop_v2775_property_estimate_healthcheck();
create or replace function public.loop_v2775_property_estimate_healthcheck()
returns table(check_name text, ok boolean, detail text)
language sql security definer set search_path = public, pg_catalog as $$
  select 'property_estimate_columns', exists(select 1 from information_schema.columns where table_schema='public' and table_name='loop_household_properties' and column_name='estimated_council_tax_band'), 'Property estimate fields exist.'
  union all select 'source_checklist', to_regclass('public.loop_property_data_sources') is not null, 'Source/API checklist exists.'
  union all select 'band_rules', exists(select 1 from public.loop_council_tax_band_rules where country_code='ENG' and band='D'), 'Band rules seeded.'
  union all select 'estimate_runs', to_regclass('public.loop_property_estimate_runs') is not null, 'Estimate run history exists.'
$$;
grant execute on function public.loop_v2775_property_estimate_healthcheck() to anon, authenticated;


-- ============================================================
-- db/v27_76_deployment_error_repair.sql
-- ============================================================

-- v27.76 Deployment error repair
-- Fixes:
-- 1) PostgreSQL syntax error from unique(lower(alias)) in old v27.63 bundled SQL.
-- 2) gen_random_bytes lookup when Supabase keeps pgcrypto in the extensions schema.
-- 3) Mortgage numeric field overflow on existing databases with older narrow numeric columns.
-- 4) Makes mortgage/date columns safe if an older database missed later schema columns.

create extension if not exists pgcrypto;

-- Supabase often installs pgcrypto into the `extensions` schema. Some older functions
-- used search_path public, pg_catalog and then called gen_random_bytes(...) unqualified.
-- This wrapper makes unqualified gen_random_bytes(...) safe without editing every old RPC.
do $do$
begin
  if to_regprocedure('public.gen_random_bytes(integer)') is null then
    execute $fn$
      create function public.gen_random_bytes(p_len integer)
      returns bytea
      language plpgsql
      volatile
      security definer
      set search_path = public, extensions, pg_catalog
      as $body$
      declare
        v_result bytea;
        v_fallback bytea := ''::bytea;
      begin
        begin
          execute 'select extensions.gen_random_bytes($1)' into v_result using p_len;
          if v_result is not null then
            return v_result;
          end if;
        exception when others then
          null;
        end;

        begin
          execute 'select pg_catalog.gen_random_bytes($1)' into v_result using p_len;
          if v_result is not null then
            return v_result;
          end if;
        exception when others then
          null;
        end;

        -- Last-resort fallback so invites still work in local/dev databases.
        -- Production Supabase should use pgcrypto above.
        while length(v_fallback) < greatest(1, p_len) loop
          v_fallback := v_fallback || decode(md5(random()::text || clock_timestamp()::text || txid_current()::text), 'hex');
        end loop;

        return substring(v_fallback from 1 for greatest(1, p_len));
      end
      $body$;
    $fn$;
  end if;
end
$do$;

grant execute on function public.gen_random_bytes(integer) to authenticated, anon;

-- Fix the v27.63 alias table if it partially ran or if the combined catch-up file was used.
create table if not exists public.app_food_product_aliases (
  id uuid primary key default gen_random_uuid(),
  alias text not null,
  canonical_name text not null,
  brand_name text,
  product_family text,
  confidence integer not null default 60,
  created_at timestamptz not null default now(),
  constraint app_food_product_aliases_confidence_check check (confidence between 0 and 100)
);

alter table public.app_food_product_aliases
  add column if not exists alias_key text;

update public.app_food_product_aliases
set alias_key = lower(trim(alias))
where alias_key is null or alias_key = '';

delete from public.app_food_product_aliases a
using public.app_food_product_aliases b
where a.alias_key = b.alias_key
  and a.id > b.id;

create unique index if not exists app_food_product_aliases_alias_key_idx
on public.app_food_product_aliases(alias_key);

-- Existing databases may have older, narrower mortgage/home numeric columns.
-- Widen them so normal UK balances and payments do not overflow.
create table if not exists public.home_mortgage_deals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  home_id uuid,
  lender text,
  product_name text,
  balance numeric default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.home_mortgage_deals
  add column if not exists balance_as_of_date date,
  add column if not exists interest_rate numeric default 0,
  add column if not exists rate_type text not null default 'fixed',
  add column if not exists repayment_type text not null default 'repayment',
  add column if not exists initial_period_end date,
  add column if not exists term_years integer not null default 25,
  add column if not exists monthly_payment_override numeric,
  add column if not exists start_date date not null default current_date,
  add column if not exists end_date date,
  add column if not exists notes text;

alter table public.home_mortgage_deals
  alter column balance type numeric(18,2) using coalesce(balance,0)::numeric(18,2),
  alter column interest_rate type numeric(9,4) using coalesce(interest_rate,0)::numeric(9,4),
  alter column monthly_payment_override type numeric(18,2) using monthly_payment_override::numeric(18,2);

-- Drop/recreate repayment check to include common values safely.
alter table public.home_mortgage_deals
  drop constraint if exists home_mortgage_deals_repayment_type_check;

alter table public.home_mortgage_deals
  add constraint home_mortgage_deals_repayment_type_check
  check (repayment_type in ('repayment', 'interest_only', 'part_and_part'));


-- Make newer home numeric fields exist before widening them.
alter table if exists public.homes
  add column if not exists estimated_value_low numeric,
  add column if not exists estimated_value_mid numeric,
  add column if not exists estimated_value_high numeric,
  add column if not exists target_purchase_price numeric,
  add column if not exists target_extra_cash numeric,
  add column if not exists property_value numeric default 0,
  add column if not exists purchase_price numeric;

alter table if exists public.homes
  alter column property_value type numeric(18,2) using coalesce(property_value,0)::numeric(18,2),
  alter column purchase_price type numeric(18,2) using purchase_price::numeric(18,2),
  alter column estimated_value_low type numeric(18,2) using estimated_value_low::numeric(18,2),
  alter column estimated_value_mid type numeric(18,2) using estimated_value_mid::numeric(18,2),
  alter column estimated_value_high type numeric(18,2) using estimated_value_high::numeric(18,2),
  alter column target_purchase_price type numeric(18,2) using target_purchase_price::numeric(18,2),
  alter column target_extra_cash type numeric(18,2) using target_extra_cash::numeric(18,2);

-- Helpful healthcheck for the exact issues reported.
drop function if exists public.loop_v2776_deployment_error_repair_healthcheck();
create or replace function public.loop_v2776_deployment_error_repair_healthcheck()
returns table(check_name text, ok boolean, detail text)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select 'gen_random_bytes_wrapper'::text,
    to_regprocedure('public.gen_random_bytes(integer)') is not null,
    'Unqualified gen_random_bytes(integer) is available to household invite RPCs.'
  union all
  select 'food_alias_sql_fixed',
    to_regclass('public.app_food_product_aliases') is not null
    and exists(select 1 from pg_indexes where schemaname = 'public' and indexname = 'app_food_product_aliases_alias_key_idx'),
    'Food alias table uses alias_key unique index instead of invalid unique(lower(alias)).'
  union all
  select 'mortgage_balance_wide',
    exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'home_mortgage_deals'
        and column_name = 'balance'
        and numeric_precision >= 18
    ),
    'Mortgage balance column is widened to numeric(18,2).'
  union all
  select 'mortgage_payment_wide',
    exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'home_mortgage_deals'
        and column_name = 'monthly_payment_override'
        and numeric_precision >= 18
    ),
    'Mortgage payment override column is widened to numeric(18,2).'
$$;

grant execute on function public.loop_v2776_deployment_error_repair_healthcheck() to anon, authenticated;
