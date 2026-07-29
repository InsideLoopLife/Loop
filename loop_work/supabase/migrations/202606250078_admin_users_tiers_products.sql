-- LOOP v27.78 Admin users / tiers / products / import control centre
--
-- Run after the v27.77B repair pack.
--
-- Purpose:
-- - Make admin useful: real user directory, tier requests, user feature overrides.
-- - Let admin define tier limits/features that the site can read.
-- - Add product library admin/search and product-import queue foundations.
-- - Add safe product URL/category/feed import workflow tables.
--
-- This is designed to be idempotent and safe after partial migrations.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

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
-- Admin access: DB-backed admin users + fallback allowlisted email
-- ---------------------------------------------------------------------------
create table if not exists public.app_admin_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  email text,
  role text not null default 'admin',
  status text not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id),
  unique(email)
);

alter table public.app_admin_users
  add column if not exists role text not null default 'admin',
  add column if not exists status text not null default 'active',
  add column if not exists notes text,
  add column if not exists updated_at timestamptz not null default now();

insert into public.app_admin_users(email, role, status, notes)
values ('dan@insideloop.life', 'owner', 'active', 'Seeded owner fallback from admin hardening repair.')
on conflict (email) do update set
  role = excluded.role,
  status = excluded.status,
  updated_at = now();

drop trigger if exists app_admin_users_updated_at on public.app_admin_users;
create trigger app_admin_users_updated_at
before update on public.app_admin_users
for each row execute function public.loop_set_updated_at();

create or replace function public.loop_is_platform_admin()
returns boolean
language sql
stable
set search_path = public, pg_catalog
as $$
  select
    coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin', '') = 'true'
    or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','owner','super_admin')
    or coalesce(auth.jwt() -> 'user_metadata' ->> 'loop_admin', '') = 'true'
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'dan@insideloop.life'
    or exists (
      select 1
      from public.app_admin_users a
      where a.status = 'active'
        and (
          a.user_id = auth.uid()
          or lower(coalesce(a.email,'')) = lower(coalesce(auth.jwt() ->> 'email',''))
        )
    );
$$;

grant execute on function public.loop_is_platform_admin() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- User admin profile + tier/feature entitlement framework
-- ---------------------------------------------------------------------------
create table if not exists public.loop_user_admin_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  household_id uuid,
  current_plan text not null default 'free',
  account_status text not null default 'active',
  in_app_notifications_enabled boolean not null default true,
  wealth_digest_enabled boolean not null default false,
  lifestyle_digest_enabled boolean not null default false,
  realtime_market_data_enabled boolean not null default false,
  provider_checks_mode text not null default 'manual',
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.loop_user_admin_profiles
  add column if not exists current_plan text not null default 'free',
  add column if not exists account_status text not null default 'active',
  add column if not exists in_app_notifications_enabled boolean not null default true,
  add column if not exists wealth_digest_enabled boolean not null default false,
  add column if not exists lifestyle_digest_enabled boolean not null default false,
  add column if not exists realtime_market_data_enabled boolean not null default false,
  add column if not exists provider_checks_mode text not null default 'manual',
  add column if not exists admin_notes text,
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists loop_user_admin_profiles_updated_at on public.loop_user_admin_profiles;
create trigger loop_user_admin_profiles_updated_at
before update on public.loop_user_admin_profiles
for each row execute function public.loop_set_updated_at();

create table if not exists public.loop_plan_tiers (
  tier_key text primary key,
  display_name text not null,
  description text,
  monthly_price_pence integer,
  yearly_price_pence integer,
  status text not null default 'active',
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.loop_plan_features (
  id uuid primary key default gen_random_uuid(),
  tier_key text not null references public.loop_plan_tiers(tier_key) on delete cascade,
  feature_key text not null,
  feature_label text not null,
  enabled boolean not null default true,
  feature_value jsonb not null default '{}'::jsonb,
  limit_value numeric,
  limit_unit text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tier_key, feature_key)
);

create table if not exists public.loop_user_feature_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  feature_key text not null,
  feature_label text,
  enabled boolean not null default true,
  override_value jsonb not null default '{}'::jsonb,
  limit_value numeric,
  limit_unit text,
  reason text,
  expires_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, feature_key)
);

create table if not exists public.loop_user_tier_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  requested_tier text not null,
  requested_features text[] not null default array[]::text[],
  request_reason text,
  status text not null default 'pending',
  admin_decision_note text,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists loop_user_tier_requests_status_idx
on public.loop_user_tier_requests(status, created_at desc);

drop trigger if exists loop_plan_tiers_updated_at on public.loop_plan_tiers;
create trigger loop_plan_tiers_updated_at
before update on public.loop_plan_tiers
for each row execute function public.loop_set_updated_at();

drop trigger if exists loop_plan_features_updated_at on public.loop_plan_features;
create trigger loop_plan_features_updated_at
before update on public.loop_plan_features
for each row execute function public.loop_set_updated_at();

drop trigger if exists loop_user_feature_overrides_updated_at on public.loop_user_feature_overrides;
create trigger loop_user_feature_overrides_updated_at
before update on public.loop_user_feature_overrides
for each row execute function public.loop_set_updated_at();

drop trigger if exists loop_user_tier_requests_updated_at on public.loop_user_tier_requests;
create trigger loop_user_tier_requests_updated_at
before update on public.loop_user_tier_requests
for each row execute function public.loop_set_updated_at();

insert into public.loop_plan_tiers(tier_key, display_name, description, monthly_price_pence, sort_order)
values
('free', 'Free', 'Basic household, nutrition and affordability indicators with conservative AI limits.', 0, 10),
('plus', 'Plus', 'Higher AI limits, more product imports and richer household/money tools.', 599, 20),
('pro', 'Pro', 'Advanced import, realtime market controls where enabled, expanded admin/provider usage.', 1499, 30),
('admin_override', 'Admin override', 'Manual override tier for beta/admin recovery.', null, 999)
on conflict (tier_key) do update set
  display_name = excluded.display_name,
  description = excluded.description,
  monthly_price_pence = excluded.monthly_price_pence,
  sort_order = excluded.sort_order,
  updated_at = now();

insert into public.loop_plan_features(tier_key, feature_key, feature_label, enabled, feature_value, limit_value, limit_unit, description)
values
('free','ai_daily_requests','AI daily requests',true,'{"reset":"daily"}',25,'requests','General AI request budget per user/day.'),
('free','product_import_monthly','Product imports/month',true,'{"mode":"manual_review_required"}',20,'products','Number of products a user/admin can import before review.'),
('free','barcode_scans_daily','Barcode scans/day',true,'{}',30,'scans','Phone camera/manual barcode lookup allowance.'),
('free','money_deal_watch','Money deal watch',true,'{"refresh":"daily_known_sources_only"}',5,'watched_deals','Savings deals watched for better rates.'),
('free','realtime_market_data','Realtime market data',false,'{"provider":"none"}',0,'enabled','Disabled unless manually upgraded.'),

('plus','ai_daily_requests','AI daily requests',true,'{"reset":"daily"}',150,'requests','Higher AI request budget.'),
('plus','product_import_monthly','Product imports/month',true,'{"mode":"batch_with_review"}',500,'products','Batch product/import allowance.'),
('plus','barcode_scans_daily','Barcode scans/day',true,'{}',150,'scans','Expanded barcode scans.'),
('plus','money_deal_watch','Money deal watch',true,'{"refresh":"daily_known_sources_only"}',25,'watched_deals','More watched savings deals.'),
('plus','realtime_market_data','Realtime market data',false,'{"provider":"manual_admin_enable"}',0,'enabled','Requires admin/provider approval.'),

('pro','ai_daily_requests','AI daily requests',true,'{"reset":"daily"}',750,'requests','High AI usage for power users.'),
('pro','product_import_monthly','Product imports/month',true,'{"mode":"bulk_with_review"}',5000,'products','High volume import/review workflows.'),
('pro','barcode_scans_daily','Barcode scans/day',true,'{}',500,'scans','High barcode scan allowance.'),
('pro','money_deal_watch','Money deal watch',true,'{"refresh":"daily_known_sources_plus_news"}',100,'watched_deals','Expanded money deal monitoring.'),
('pro','realtime_market_data','Realtime market data',true,'{"provider":"admin_checked_required"}',1,'enabled','Can be enabled where paid data/provider checks pass.')
on conflict (tier_key, feature_key) do update set
  feature_label = excluded.feature_label,
  enabled = excluded.enabled,
  feature_value = excluded.feature_value,
  limit_value = excluded.limit_value,
  limit_unit = excluded.limit_unit,
  description = excluded.description,
  updated_at = now();

-- Backfill auth users into admin profiles so your admin screen has rows.
insert into public.loop_user_admin_profiles(user_id, display_name, current_plan)
select u.id, coalesce(u.raw_user_meta_data ->> 'name', u.email), 'free'
from auth.users u
where not exists (
  select 1 from public.loop_user_admin_profiles p where p.user_id = u.id
);

-- ---------------------------------------------------------------------------
-- Admin product import / scan queue
-- ---------------------------------------------------------------------------
create table if not exists public.loop_product_import_sources (
  id uuid primary key default gen_random_uuid(),
  source_name text not null,
  retailer_key text not null,
  source_kind text not null default 'category_url',
  source_url text not null,
  import_scope text not null default 'food_drink',
  enabled boolean not null default true,
  polite_crawl_delay_ms integer not null default 1000,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.loop_product_import_scan_jobs (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid references auth.users(id) on delete set null,
  source_id uuid references public.loop_product_import_sources(id) on delete set null,
  retailer_key text not null,
  source_url text not null,
  source_kind text not null default 'category_url',
  import_scope text not null default 'food_drink',
  status text not null default 'queued',
  priority integer not null default 100,
  scan_mode text not null default 'discover_and_review',
  max_pages integer not null default 50,
  products_found integer not null default 0,
  products_ready integer not null default 0,
  products_needing_review integer not null default 0,
  last_error text,
  result_payload jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.loop_product_import_scan_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.loop_product_import_scan_jobs(id) on delete cascade,
  source_url text not null,
  canonical_url text,
  retailer_key text,
  product_name text,
  brand_name text,
  barcode_gtin text,
  image_url text,
  price_amount numeric,
  price_currency text,
  ingredients_text text,
  allergens_text text,
  nutrition_json jsonb not null default '{}'::jsonb,
  micronutrients_json jsonb not null default '{}'::jsonb,
  serving_json jsonb not null default '{}'::jsonb,
  source_snapshot jsonb not null default '{}'::jsonb,
  confidence integer not null default 0,
  status text not null default 'discovered',
  matched_card_id uuid,
  missing_fields text[] not null default array[]::text[],
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists loop_product_import_scan_jobs_status_idx
on public.loop_product_import_scan_jobs(status, priority, created_at);

create index if not exists loop_product_import_scan_items_job_idx
on public.loop_product_import_scan_items(job_id, status, product_name);

drop trigger if exists loop_product_import_sources_updated_at on public.loop_product_import_sources;
create trigger loop_product_import_sources_updated_at
before update on public.loop_product_import_sources
for each row execute function public.loop_set_updated_at();

drop trigger if exists loop_product_import_scan_jobs_updated_at on public.loop_product_import_scan_jobs;
create trigger loop_product_import_scan_jobs_updated_at
before update on public.loop_product_import_scan_jobs
for each row execute function public.loop_set_updated_at();

drop trigger if exists loop_product_import_scan_items_updated_at on public.loop_product_import_scan_items;
create trigger loop_product_import_scan_items_updated_at
before update on public.loop_product_import_scan_items
for each row execute function public.loop_set_updated_at();

-- ---------------------------------------------------------------------------
-- Admin RPCs
-- ---------------------------------------------------------------------------
create or replace function public.loop_admin_user_directory(p_search text default null)
returns table (
  user_id uuid,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  display_name text,
  household_id uuid,
  current_plan text,
  account_status text,
  in_app_notifications_enabled boolean,
  wealth_digest_enabled boolean,
  lifestyle_digest_enabled boolean,
  realtime_market_data_enabled boolean,
  provider_checks_mode text,
  pending_tier_requests integer,
  feature_overrides jsonb
)
language sql
security definer
set search_path = public, pg_catalog, auth
as $$
  select
    u.id,
    u.email::text,
    u.created_at,
    u.last_sign_in_at,
    coalesce(p.display_name, u.raw_user_meta_data ->> 'name', u.email)::text,
    p.household_id,
    coalesce(p.current_plan, 'free')::text,
    coalesce(p.account_status, 'active')::text,
    coalesce(p.in_app_notifications_enabled, true),
    coalesce(p.wealth_digest_enabled, false),
    coalesce(p.lifestyle_digest_enabled, false),
    coalesce(p.realtime_market_data_enabled, false),
    coalesce(p.provider_checks_mode, 'manual')::text,
    coalesce((
      select count(*)::integer
      from public.loop_user_tier_requests r
      where r.user_id = u.id and r.status = 'pending'
    ), 0),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'feature_key', o.feature_key,
        'enabled', o.enabled,
        'limit_value', o.limit_value,
        'limit_unit', o.limit_unit,
        'override_value', o.override_value,
        'reason', o.reason,
        'expires_at', o.expires_at
      ) order by o.feature_key)
      from public.loop_user_feature_overrides o
      where o.user_id = u.id
    ), '[]'::jsonb)
  from auth.users u
  left join public.loop_user_admin_profiles p on p.user_id = u.id
  where public.loop_is_platform_admin()
    and (
      p_search is null
      or p_search = ''
      or u.id::text ilike '%' || p_search || '%'
      or u.email ilike '%' || p_search || '%'
      or coalesce(p.display_name, '') ilike '%' || p_search || '%'
    )
  order by u.created_at desc;
$$;

grant execute on function public.loop_admin_user_directory(text) to authenticated;

create or replace function public.loop_effective_user_entitlements(p_user_id uuid default auth.uid())
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_plan text;
  v_features jsonb;
  v_overrides jsonb;
begin
  select coalesce(current_plan, 'free')
  into v_plan
  from public.loop_user_admin_profiles
  where user_id = coalesce(p_user_id, auth.uid());

  v_plan := coalesce(v_plan, 'free');

  select coalesce(jsonb_object_agg(
    f.feature_key,
    jsonb_build_object(
      'enabled', f.enabled,
      'limit_value', f.limit_value,
      'limit_unit', f.limit_unit,
      'feature_value', f.feature_value,
      'source', 'tier',
      'tier_key', f.tier_key
    )
  ), '{}'::jsonb)
  into v_features
  from public.loop_plan_features f
  where f.tier_key = v_plan;

  select coalesce(jsonb_object_agg(
    o.feature_key,
    jsonb_build_object(
      'enabled', o.enabled,
      'limit_value', o.limit_value,
      'limit_unit', o.limit_unit,
      'feature_value', o.override_value,
      'source', 'user_override',
      'reason', o.reason,
      'expires_at', o.expires_at
    )
  ), '{}'::jsonb)
  into v_overrides
  from public.loop_user_feature_overrides o
  where o.user_id = coalesce(p_user_id, auth.uid())
    and (o.expires_at is null or o.expires_at > now());

  return jsonb_build_object(
    'user_id', coalesce(p_user_id, auth.uid()),
    'plan', v_plan,
    'features', coalesce(v_features, '{}'::jsonb) || coalesce(v_overrides, '{}'::jsonb)
  );
end;
$$;

grant execute on function public.loop_effective_user_entitlements(uuid) to authenticated;

create or replace function public.loop_admin_product_library(
  p_search text default null,
  p_sort text default 'added_desc',
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  product_id uuid,
  display_name text,
  brand_name text,
  card_kind text,
  source_url text,
  main_image_url text,
  created_at timestamptz,
  confidence integer,
  status text,
  data_quality_status text,
  missing_fields text[]
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_sql text;
  v_order text;
  v_has_cards boolean := to_regclass('public.loop_nutrition_cards') is not null;
  v_cols text[];
  v_name text;
  v_brand text;
  v_kind text;
  v_source text;
  v_image text;
  v_created text;
  v_conf text;
  v_status text;
  v_quality text;
begin
  if not public.loop_is_platform_admin() then
    return;
  end if;

  if not v_has_cards then
    return;
  end if;

  select array_agg(column_name::text)
  into v_cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'loop_nutrition_cards';

  v_name := case
    when 'display_name' = any(v_cols) then 'c.display_name'
    when 'name' = any(v_cols) then 'c.name'
    when 'product_name' = any(v_cols) then 'c.product_name'
    else 'null::text'
  end;

  v_brand := case
    when 'brand_name' = any(v_cols) then 'c.brand_name'
    when 'brand' = any(v_cols) then 'c.brand'
    else 'null::text'
  end;

  v_kind := case when 'card_kind' = any(v_cols) then 'c.card_kind' else '''product''::text' end;
  v_source := case when 'source_url' = any(v_cols) then 'c.source_url' else 'null::text' end;
  v_image := case when 'main_image_url' = any(v_cols) then 'c.main_image_url' when 'image_url' = any(v_cols) then 'c.image_url' else 'null::text' end;
  v_created := case when 'created_at' = any(v_cols) then 'c.created_at' else 'now()' end;
  v_conf := case when 'confidence' = any(v_cols) then 'c.confidence' else 'null::integer' end;
  v_status := case when 'status' = any(v_cols) then 'c.status' else '''active''::text' end;
  v_quality := case when 'data_quality_status' = any(v_cols) then 'c.data_quality_status' else 'null::text' end;

  v_order := case p_sort
    when 'alpha' then 'display_name asc nulls last'
    when 'alpha_desc' then 'display_name desc nulls last'
    when 'confidence_low' then 'confidence asc nulls first'
    when 'confidence_high' then 'confidence desc nulls last'
    when 'added_asc' then 'created_at asc nulls last'
    else 'created_at desc nulls last'
  end;

  v_sql := format($f$
    with base as (
      select
        c.id::uuid as product_id,
        %1$s::text as display_name,
        %2$s::text as brand_name,
        %3$s::text as card_kind,
        %4$s::text as source_url,
        %5$s::text as main_image_url,
        %6$s::timestamptz as created_at,
        %7$s::integer as confidence,
        %8$s::text as status,
        %9$s::text as data_quality_status,
        array_remove(array[
          case when nullif(%1$s::text,'') is null then 'name' end,
          case when nullif(%5$s::text,'') is null then 'image' end,
          case when nullif(%4$s::text,'') is null then 'source_url' end,
          case when %7$s::integer is null or %7$s::integer < 70 then 'confidence' end
        ], null)::text[] as missing_fields
      from public.loop_nutrition_cards c
    )
    select *
    from base
    where ($1 is null or $1 = ''
      or display_name ilike '%%' || $1 || '%%'
      or brand_name ilike '%%' || $1 || '%%'
      or source_url ilike '%%' || $1 || '%%')
    order by %10$s
    limit $2 offset $3
  $f$, v_name, v_brand, v_kind, v_source, v_image, v_created, v_conf, v_status, v_quality, v_order);

  return query execute v_sql using p_search, greatest(1, least(coalesce(p_limit,100),500)), greatest(0, coalesce(p_offset,0));
end;
$$;

grant execute on function public.loop_admin_product_library(text,text,integer,integer) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.app_admin_users enable row level security;
alter table public.loop_user_admin_profiles enable row level security;
alter table public.loop_plan_tiers enable row level security;
alter table public.loop_plan_features enable row level security;
alter table public.loop_user_feature_overrides enable row level security;
alter table public.loop_user_tier_requests enable row level security;
alter table public.loop_product_import_sources enable row level security;
alter table public.loop_product_import_scan_jobs enable row level security;
alter table public.loop_product_import_scan_items enable row level security;

drop policy if exists "app admin users admin" on public.app_admin_users;
create policy "app admin users admin" on public.app_admin_users
for all to authenticated using (public.loop_is_platform_admin())
with check (public.loop_is_platform_admin());

drop policy if exists "user admin profiles admin readwrite" on public.loop_user_admin_profiles;
create policy "user admin profiles admin readwrite" on public.loop_user_admin_profiles
for all to authenticated using (public.loop_is_platform_admin() or user_id = auth.uid())
with check (public.loop_is_platform_admin() or user_id = auth.uid());

drop policy if exists "plan tiers readable" on public.loop_plan_tiers;
create policy "plan tiers readable" on public.loop_plan_tiers
for select to authenticated using (true);

drop policy if exists "plan tiers admin write" on public.loop_plan_tiers;
create policy "plan tiers admin write" on public.loop_plan_tiers
for all to authenticated using (public.loop_is_platform_admin())
with check (public.loop_is_platform_admin());

drop policy if exists "plan features readable" on public.loop_plan_features;
create policy "plan features readable" on public.loop_plan_features
for select to authenticated using (true);

drop policy if exists "plan features admin write" on public.loop_plan_features;
create policy "plan features admin write" on public.loop_plan_features
for all to authenticated using (public.loop_is_platform_admin())
with check (public.loop_is_platform_admin());

drop policy if exists "user overrides owner/admin read" on public.loop_user_feature_overrides;
create policy "user overrides owner/admin read" on public.loop_user_feature_overrides
for select to authenticated using (user_id = auth.uid() or public.loop_is_platform_admin());

drop policy if exists "user overrides admin write" on public.loop_user_feature_overrides;
create policy "user overrides admin write" on public.loop_user_feature_overrides
for all to authenticated using (public.loop_is_platform_admin())
with check (public.loop_is_platform_admin());

drop policy if exists "tier requests owner insert read" on public.loop_user_tier_requests;
create policy "tier requests owner insert read" on public.loop_user_tier_requests
for select to authenticated using (user_id = auth.uid() or public.loop_is_platform_admin());

drop policy if exists "tier requests owner insert" on public.loop_user_tier_requests;
create policy "tier requests owner insert" on public.loop_user_tier_requests
for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "tier requests admin update" on public.loop_user_tier_requests;
create policy "tier requests admin update" on public.loop_user_tier_requests
for update to authenticated using (public.loop_is_platform_admin())
with check (public.loop_is_platform_admin());

drop policy if exists "product import sources admin" on public.loop_product_import_sources;
create policy "product import sources admin" on public.loop_product_import_sources
for all to authenticated using (public.loop_is_platform_admin())
with check (public.loop_is_platform_admin());

drop policy if exists "product scan jobs admin" on public.loop_product_import_scan_jobs;
create policy "product scan jobs admin" on public.loop_product_import_scan_jobs
for all to authenticated using (public.loop_is_platform_admin())
with check (public.loop_is_platform_admin());

drop policy if exists "product scan items admin" on public.loop_product_import_scan_items;
create policy "product scan items admin" on public.loop_product_import_scan_items
for all to authenticated using (public.loop_is_platform_admin())
with check (public.loop_is_platform_admin());

-- ---------------------------------------------------------------------------
-- Healthcheck
-- ---------------------------------------------------------------------------
create or replace function public.loop_v2778_admin_users_tiers_products_healthcheck()
returns table(section text, check_name text, ok boolean, detail text)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select 'admin','admin users table',
    to_regclass('public.app_admin_users') is not null,
    'DB-backed admin users exist.'
  union all select 'admin','admin function',
    exists(select 1 from pg_proc where proname='loop_is_platform_admin'),
    'Admin access function exists.'
  union all select 'users','user admin profiles',
    to_regclass('public.loop_user_admin_profiles') is not null,
    'Admin profile table exists.'
  union all select 'users','auth users visible through RPC',
    exists(select 1 from pg_proc where proname='loop_admin_user_directory'),
    'Admin user directory RPC exists.'
  union all select 'tiers','plan tiers',
    exists(select 1 from public.loop_plan_tiers where tier_key='free'),
    'Tier seeds exist.'
  union all select 'tiers','plan features',
    exists(select 1 from public.loop_plan_features where feature_key='ai_daily_requests'),
    'Feature/limit seeds exist.'
  union all select 'tiers','tier requests',
    to_regclass('public.loop_user_tier_requests') is not null,
    'Tier request table exists.'
  union all select 'tiers','effective entitlements',
    exists(select 1 from pg_proc where proname='loop_effective_user_entitlements'),
    'App can read merged tier + override entitlement JSON.'
  union all select 'products','product library RPC',
    exists(select 1 from pg_proc where proname='loop_admin_product_library'),
    'Admin product search/list RPC exists.'
  union all select 'products','product scan jobs',
    to_regclass('public.loop_product_import_scan_jobs') is not null,
    'Product source scan/import queue exists.'
  union all select 'products','product scan items',
    to_regclass('public.loop_product_import_scan_items') is not null,
    'Product scan item staging table exists.'
$$;

grant execute on function public.loop_v2778_admin_users_tiers_products_healthcheck() to anon, authenticated;
