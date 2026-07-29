-- v27.60 Inside LOOP tier dependency repair
-- Use when v27.59 healthcheck shows:
-- tier_tables_available = false
--
-- This safely creates/repairs the v27.58 tier tables, seeds default plans/features,
-- and gives existing auth users a Free plan if missing.

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

create or replace function public.app_is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_catalog
as $$
  select coalesce(
    (
      coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('owner','admin','super_admin')
      or coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin', '') = 'true'
      or exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and lower(coalesce(p.role, '')) in ('owner','admin','super_admin')
      )
    ),
    false
  );
$$;

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

drop trigger if exists app_tier_plans_updated_at on public.app_tier_plans;
create trigger app_tier_plans_updated_at
before update on public.app_tier_plans
for each row execute function public.app_set_updated_at();

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

drop trigger if exists app_tier_features_updated_at on public.app_tier_features;
create trigger app_tier_features_updated_at
before update on public.app_tier_features
for each row execute function public.app_set_updated_at();

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

drop trigger if exists app_tier_plan_features_updated_at on public.app_tier_plan_features;
create trigger app_tier_plan_features_updated_at
before update on public.app_tier_plan_features
for each row execute function public.app_set_updated_at();

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

drop trigger if exists app_user_plan_memberships_updated_at on public.app_user_plan_memberships;
create trigger app_user_plan_memberships_updated_at
before update on public.app_user_plan_memberships
for each row execute function public.app_set_updated_at();

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

create index if not exists app_feature_usage_events_user_feature_idx
on public.app_feature_usage_events(user_id, feature_key, created_at desc);

alter table public.app_tier_plans enable row level security;
alter table public.app_tier_features enable row level security;
alter table public.app_tier_plan_features enable row level security;
alter table public.app_user_plan_memberships enable row level security;
alter table public.app_plan_change_requests enable row level security;
alter table public.app_feature_usage_events enable row level security;

drop policy if exists "plans visible to users" on public.app_tier_plans;
create policy "plans visible to users"
on public.app_tier_plans
for select
to authenticated
using (is_active = true and visible_to_users = true);

drop policy if exists "plans admin all" on public.app_tier_plans;
create policy "plans admin all"
on public.app_tier_plans
for all
to authenticated
using (public.app_is_platform_admin())
with check (public.app_is_platform_admin());

drop policy if exists "features visible to users" on public.app_tier_features;
create policy "features visible to users"
on public.app_tier_features
for select
to authenticated
using (is_active = true);

drop policy if exists "features admin all" on public.app_tier_features;
create policy "features admin all"
on public.app_tier_features
for all
to authenticated
using (public.app_is_platform_admin())
with check (public.app_is_platform_admin());

drop policy if exists "plan features visible to users" on public.app_tier_plan_features;
create policy "plan features visible to users"
on public.app_tier_plan_features
for select
to authenticated
using (
  exists (
    select 1 from public.app_tier_plans p
    where p.slug = app_tier_plan_features.plan_slug
      and p.is_active = true
      and p.visible_to_users = true
  )
);

drop policy if exists "plan features admin all" on public.app_tier_plan_features;
create policy "plan features admin all"
on public.app_tier_plan_features
for all
to authenticated
using (public.app_is_platform_admin())
with check (public.app_is_platform_admin());

drop policy if exists "user plan self select" on public.app_user_plan_memberships;
create policy "user plan self select"
on public.app_user_plan_memberships
for select
to authenticated
using (user_id = auth.uid() or public.app_is_platform_admin());

drop policy if exists "user plan admin all" on public.app_user_plan_memberships;
create policy "user plan admin all"
on public.app_user_plan_memberships
for all
to authenticated
using (public.app_is_platform_admin())
with check (public.app_is_platform_admin());

drop policy if exists "plan requests self create" on public.app_plan_change_requests;
create policy "plan requests self create"
on public.app_plan_change_requests
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "plan requests self select" on public.app_plan_change_requests;
create policy "plan requests self select"
on public.app_plan_change_requests
for select
to authenticated
using (user_id = auth.uid() or public.app_is_platform_admin());

drop policy if exists "plan requests admin update" on public.app_plan_change_requests;
create policy "plan requests admin update"
on public.app_plan_change_requests
for update
to authenticated
using (public.app_is_platform_admin())
with check (public.app_is_platform_admin());

drop policy if exists "usage self select" on public.app_feature_usage_events;
create policy "usage self select"
on public.app_feature_usage_events
for select
to authenticated
using (user_id = auth.uid() or public.app_is_platform_admin());

drop policy if exists "usage self insert" on public.app_feature_usage_events;
create policy "usage self insert"
on public.app_feature_usage_events
for insert
to authenticated
with check (user_id = auth.uid() or public.app_is_platform_admin());

insert into public.app_tier_plans
(slug, name, description, is_active, visible_to_users, is_paid, payment_required, monthly_price_pence, annual_price_pence, sort_order, badge)
values
('free', 'Free', 'Core manual tracking and beta access.', true, true, false, false, 0, 0, 10, 'Beta'),
('plus', 'Plus', 'Higher AI limits, household tools and deeper health/wealth insights.', true, true, true, false, 799, 7990, 20, 'Testing'),
('pro', 'Pro', 'Advanced AI, wider household limits and future realtime/integration features.', true, true, true, false, 1499, 14990, 30, 'Testing'),
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

insert into public.app_tier_features(feature_key, category, name, description)
values
('ai_chat', 'AI', 'AI chat / questions', 'Ask LOOP questions about your own household data.'),
('ai_food_parse', 'AI', 'AI food parsing', 'Freehand meal/drink parsing.'),
('ai_label_scan', 'AI', 'Label scanner', 'Read nutrition/supplement labels.'),
('household_members', 'Household', 'Household members', 'Number of household members/profiles.'),
('nutrition_logging', 'Health', 'Nutrition logging', 'Daily food, drink and nutrient tracking.'),
('nutrition_insights', 'Health', 'Nutrition insights', 'Daily/weekly/monthly nutrition summaries.'),
('wealth_manual', 'Wealth', 'Manual wealth tracking', 'Manual income, bills, assets and liabilities.'),
('investment_lookup', 'Wealth', 'Investment lookup', 'Search stocks, ETFs and funds.'),
('market_data_realtime', 'Wealth', 'Realtime market data', 'Realtime/paid market integrations.'),
('snaptrade', 'Wealth', 'SnapTrade integration', 'Brokerage/investment account connection.'),
('data_export', 'Account', 'Data export', 'Export user/household data.')
on conflict (feature_key) do update set
  category = excluded.category,
  name = excluded.name,
  description = excluded.description,
  updated_at = now();

insert into public.app_tier_plan_features(plan_slug, feature_key, enabled, limit_value, limit_period, enforcement_mode, health_status, user_message)
values
('free','ai_chat',true,10,'day','audit','active','Free beta: 10 AI questions per day.'),
('free','ai_food_parse',true,10,'day','audit','active','Free beta: AI food parsing enabled.'),
('free','ai_label_scan',true,5,'month','audit','active','Free beta: limited label scans.'),
('free','household_members',true,4,'none','audit','active','Free beta household access.'),
('free','nutrition_logging',true,null,'none','audit','active','Nutrition logging enabled.'),
('free','nutrition_insights',true,null,'none','audit','active','Basic nutrition insights enabled.'),
('free','wealth_manual',true,null,'none','audit','active','Manual wealth tracking enabled.'),
('free','investment_lookup',true,25,'month','audit','active','Delayed/basic investment lookup enabled.'),
('free','market_data_realtime',false,null,'none','upgrade','hidden','Realtime data requires Pro later.'),
('free','snaptrade',false,null,'none','upgrade','hidden','SnapTrade requires Pro later.'),
('free','data_export',false,null,'none','upgrade','hidden','Export requires Plus later.'),

('plus','ai_chat',true,75,'day','audit','active','Plus beta: 75 AI questions per day.'),
('plus','ai_food_parse',true,100,'day','audit','active','Plus beta: higher AI food parsing.'),
('plus','ai_label_scan',true,100,'month','audit','active','Plus beta: label scans enabled.'),
('plus','household_members',true,8,'none','audit','active','Plus household access.'),
('plus','nutrition_logging',true,null,'none','audit','active','Nutrition logging enabled.'),
('plus','nutrition_insights',true,null,'none','audit','active','Deeper nutrition insights enabled.'),
('plus','wealth_manual',true,null,'none','audit','active','Manual wealth tracking enabled.'),
('plus','investment_lookup',true,250,'month','audit','active','Delayed/basic investment lookup enabled.'),
('plus','market_data_realtime',false,null,'none','upgrade','hidden','Realtime data requires Pro later.'),
('plus','snaptrade',false,null,'none','upgrade','hidden','SnapTrade requires Pro later.'),
('plus','data_export',true,null,'none','audit','active','Export enabled.'),

('pro','ai_chat',true,300,'day','audit','active','Pro beta: 300 AI questions per day.'),
('pro','ai_food_parse',true,500,'day','audit','active','Pro beta: high AI food parsing.'),
('pro','ai_label_scan',true,500,'month','audit','active','Pro beta: label scans enabled.'),
('pro','household_members',true,15,'none','audit','active','Pro household access.'),
('pro','nutrition_logging',true,null,'none','audit','active','Nutrition logging enabled.'),
('pro','nutrition_insights',true,null,'none','audit','active','Advanced nutrition insights enabled.'),
('pro','wealth_manual',true,null,'none','audit','active','Manual wealth tracking enabled.'),
('pro','investment_lookup',true,1000,'month','audit','active','Investment lookup enabled.'),
('pro','market_data_realtime',true,null,'none','audit','degraded','Realtime data ready but supplier/payment dependent.'),
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

insert into public.app_user_plan_memberships(user_id, plan_slug, status, source)
select u.id, 'free', 'active', 'default'
from auth.users u
where not exists (
  select 1 from public.app_user_plan_memberships m where m.user_id = u.id
);

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
begin
  if v_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  insert into public.app_user_plan_memberships(user_id, plan_slug, status, source)
  values (v_user_id, 'free', 'active', 'default')
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
  where pf.plan_slug = v_plan_slug;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc), '[]'::jsonb)
  into v_requests
  from (
    select *
    from public.app_plan_change_requests
    where user_id = v_user_id
    order by created_at desc
    limit 5
  ) r;

  return jsonb_build_object(
    'current_plan', v_plan,
    'features', v_features,
    'recent_requests', v_requests
  );
end;
$$;

grant execute on function public.app_get_my_plan() to authenticated;

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

  select plan_slug into v_current
  from public.app_user_plan_memberships
  where user_id = v_user_id
  limit 1;

  insert into public.app_plan_change_requests(user_id, requested_plan_slug, current_plan_slug, note)
  values (v_user_id, p_plan_slug, coalesce(v_current, 'free'), p_note)
  returning id into v_request_id;

  return jsonb_build_object(
    'ok', true,
    'request_id', v_request_id,
    'message', 'Plan change request logged for beta testing.'
  );
end;
$$;

grant execute on function public.app_request_plan_change(text, text) to authenticated;

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

create or replace function public.app_v2760_healthcheck()
returns table(check_name text, ok boolean, detail text)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select 'app_tier_plans'::text, to_regclass('public.app_tier_plans') is not null, 'Plan table exists.'::text
  union all
  select 'app_tier_features'::text, to_regclass('public.app_tier_features') is not null, 'Feature table exists.'::text
  union all
  select 'app_tier_plan_features'::text, to_regclass('public.app_tier_plan_features') is not null, 'Plan-feature table exists.'::text
  union all
  select 'app_user_plan_memberships'::text, to_regclass('public.app_user_plan_memberships') is not null, 'User membership table exists.'::text
  union all
  select 'free_plan_seeded'::text, exists(select 1 from public.app_tier_plans where slug = 'free'), 'Free plan seeded.'::text
  union all
  select 'investment_lookup_seeded'::text, exists(select 1 from public.app_tier_features where feature_key = 'investment_lookup'), 'Investment lookup feature seeded.'::text
  union all
  select 'my_plan_rpc'::text, exists(select 1 from pg_proc where proname = 'app_get_my_plan'), 'User plan RPC exists.'::text
  union all
  select 'admin_users_by_tier_rpc'::text, exists(select 1 from pg_proc where proname = 'app_admin_list_users_by_tier'), 'Admin users-by-tier RPC exists.'::text;
$$;

grant execute on function public.app_v2760_healthcheck() to anon;
grant execute on function public.app_v2760_healthcheck() to authenticated;
