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
