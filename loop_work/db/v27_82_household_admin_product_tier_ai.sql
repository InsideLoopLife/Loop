-- LOOP v27.82 - household/admin/product/tier AI fixes
-- Run this in Supabase SQL editor after v27.81.
-- Covers:
--   1) admin users RPC ambiguous user_id fix
--   2) product quality RPC now returns all products, left-joined to quality snapshots
--   3) AI model route/tier-key configuration tables
--   4) investment coverage AI request audit table

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Safe helpers used by column-safe RPCs
-- ---------------------------------------------------------------------------

create or replace function public.loop_try_numeric(p_value text)
returns numeric
language plpgsql
immutable
as $$
declare
  v text := nullif(regexp_replace(coalesce(p_value, ''), '[^0-9.\-]', '', 'g'), '');
begin
  if v is null or v in ('-', '.') then
    return null;
  end if;
  return v::numeric;
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
  if nullif(p_value, '') is null then
    return null;
  end if;
  return p_value::timestamptz;
exception when others then
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin users list: fully qualified aliases avoid PL/pgSQL user_id ambiguity.
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
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 1000));
begin
  return query
  select
    auu.id as user_id,
    auu.email::text as email,
    auu.created_at as created_at,
    auu.last_sign_in_at as last_sign_in_at,
    adm.role::text as admin_role,
    adm.status::text as admin_status,
    case when prof.user_id is not null then 'profile linked' else 'profile missing' end::text as profile_status,
    coalesce(hh.household_count, 0)::integer as household_count,
    prof.display_name::text as display_name,
    coalesce(prof.payment_tier, 'free')::text as payment_tier,
    coalesce(prof.payment_tier_status, 'inactive')::text as payment_tier_status,
    coalesce(prof.market_data_tier, 'manual')::text as market_data_tier,
    coalesce(prof.market_data_realtime_enabled, false) as market_data_realtime_enabled,
    coalesce(pref.in_app_enabled, false) as in_app_enabled,
    coalesce(pref.finance_digest_enabled, false) as wealth_digest_enabled,
    coalesce(pref.lifestyle_digest_enabled, pref.health_digest_enabled, false) as lifestyle_digest_enabled,
    prof.updated_at as profile_updated_at
  from auth.users as auu
  left join public.app_admin_users as adm
    on lower(adm.email) = lower(auu.email)
  left join public.app_user_profiles as prof
    on prof.user_id = auu.id
  left join public.app_notification_preferences as pref
    on pref.user_id = auu.id
  left join (
    select ahm.user_id as member_user_id, count(*)::integer as household_count
    from public.app_household_members as ahm
    where ahm.status = 'active'
    group by ahm.user_id
  ) as hh
    on hh.member_user_id = auu.id
  order by auu.created_at desc
  limit v_limit;
end;
$$;

grant execute on function public.loop_admin_users_list(integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Product list: left-join quality snapshots to source products, so a short
-- quality snapshot table no longer hides the rest of the shared product DB.
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
  updated_at timestamptz not null default now(),
  unique(card_id)
);

create index if not exists loop_product_quality_status_idx
on public.loop_product_quality_snapshots(status, quality_score, last_checked_at desc);

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
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 5000));
  v_cards_count integer := 0;
begin
  if to_regclass('public.loop_nutrition_cards') is not null then
    execute 'select count(*)::integer from public.loop_nutrition_cards' into v_cards_count;
  end if;

  if v_cards_count > 0 then
    return query execute format($sql$
      with src as (
        select c.id::uuid as product_id, to_jsonb(c) as j
        from public.loop_nutrition_cards as c
      ), mapped as (
        select
          s.product_id,
          coalesce(s.j ->> 'display_name', s.j ->> 'name', s.j ->> 'title', s.j ->> 'product_name', s.j ->> 'formal_name', 'Unnamed product')::text as display_name,
          coalesce(s.j ->> 'brand_name', s.j ->> 'brand', s.j ->> 'vendor', s.j ->> 'retailer_name')::text as brand_name,
          coalesce(s.j ->> 'product_type', s.j ->> 'card_kind', s.j ->> 'category', s.j ->> 'category_path')::text as product_type,
          coalesce(s.j ->> 'source_provider', s.j ->> 'source_kind', s.j ->> 'retailer_name', s.j ->> 'shop_tag')::text as source_provider,
          coalesce(s.j ->> 'source_url', s.j ->> 'url', s.j ->> 'product_url')::text as source_url,
          coalesce(s.j ->> 'main_image_url', s.j ->> 'image_url', s.j ->> 'image', s.j ->> 'thumbnail_url')::text as main_image_url,
          coalesce(
            public.loop_try_numeric(s.j ->> 'calories'),
            public.loop_try_numeric(s.j #>> '{nutrition,calories}'),
            public.loop_try_numeric(s.j #>> '{nutrition,kcal}'),
            public.loop_try_numeric(s.j #>> '{nutrition,energy_kcal}'),
            public.loop_try_numeric(s.j ->> 'energy_kcal')
          )::numeric as calories,
          coalesce(
            public.loop_try_numeric(s.j ->> 'confidence'),
            public.loop_try_numeric(s.j ->> 'estimate_confidence'),
            public.loop_try_numeric(s.j ->> 'source_confidence')
          )::integer as confidence,
          coalesce(s.j ->> 'status', s.j ->> 'data_quality_status', 'active')::text as source_status,
          coalesce(public.loop_try_timestamptz(s.j ->> 'updated_at'), public.loop_try_timestamptz(s.j ->> 'created_at'), now()) as source_updated_at
        from src as s
      ), joined as (
        select
          m.product_id,
          coalesce(q.display_name, m.display_name)::text as display_name,
          coalesce(q.brand_name, m.brand_name)::text as brand_name,
          coalesce(q.product_type, m.product_type)::text as product_type,
          coalesce(q.source_provider, m.source_provider)::text as source_provider,
          coalesce(q.source_url, m.source_url)::text as source_url,
          coalesce(q.main_image_url, m.main_image_url)::text as main_image_url,
          coalesce(q.calories, m.calories)::numeric as calories,
          coalesce(q.confidence, m.confidence, 0)::integer as confidence,
          q.has_image as q_has_image,
          q.has_nutrition as q_has_nutrition,
          q.has_verified_source as q_has_verified_source,
          q.quality_score as q_quality_score,
          q.missing_fields as q_missing_fields,
          coalesce(q.status, m.source_status, 'needs_review')::text as status,
          coalesce(q.updated_at, q.last_checked_at, m.source_updated_at, now()) as updated_at
        from mapped as m
        left join public.loop_product_quality_snapshots as q on q.card_id = m.product_id
      )
      select
        j.product_id,
        j.display_name,
        j.brand_name,
        j.product_type,
        j.source_provider,
        j.source_url,
        j.main_image_url,
        j.calories,
        j.confidence,
        coalesce(j.q_has_image, nullif(j.main_image_url, '') is not null) as has_image,
        coalesce(j.q_has_nutrition, j.calories is not null) as has_nutrition,
        coalesce(j.q_has_verified_source, nullif(j.source_url, '') is not null or nullif(j.source_provider, '') is not null) as has_verified_source,
        coalesce(j.q_quality_score,
          (
            case when nullif(j.main_image_url, '') is not null then 25 else 0 end
            + case when j.calories is not null then 35 else 0 end
            + case when nullif(j.source_url, '') is not null or nullif(j.source_provider, '') is not null then 25 else 0 end
            + case when coalesce(j.confidence, 0) >= 70 then 15 else 0 end
          )::integer
        ) as quality_score,
        coalesce(j.q_missing_fields, array_remove(array[
          case when nullif(j.main_image_url, '') is null then 'image' end,
          case when j.calories is null then 'nutrition' end,
          case when not (nullif(j.source_url, '') is not null or nullif(j.source_provider, '') is not null) then 'verified_source' end,
          case when coalesce(j.confidence, 0) < 70 then 'confidence' end
        ], null)::text[]) as missing_fields,
        j.status,
        j.updated_at
      from joined as j
      order by quality_score asc, updated_at desc
      limit %s
    $sql$, v_limit);
    return;
  end if;

  if to_regclass('public.app_products') is not null then
    return query execute format($sql$
      with src as (
        select p.id::uuid as product_id, to_jsonb(p) as j
        from public.app_products as p
      ), mapped as (
        select
          s.product_id,
          coalesce(s.j ->> 'display_name', s.j ->> 'title', s.j ->> 'name', 'Unnamed product')::text as display_name,
          coalesce(s.j ->> 'brand_name', s.j ->> 'brand', s.j ->> 'vendor')::text as brand_name,
          coalesce(s.j ->> 'product_type', s.j ->> 'category')::text as product_type,
          coalesce(s.j ->> 'source_provider', s.j ->> 'shop_tag')::text as source_provider,
          coalesce(s.j ->> 'source_url', s.j ->> 'url', s.j ->> 'product_url')::text as source_url,
          coalesce(s.j ->> 'main_image_url', s.j ->> 'image_url', s.j ->> 'image')::text as main_image_url,
          coalesce(public.loop_try_timestamptz(s.j ->> 'updated_at'), public.loop_try_timestamptz(s.j ->> 'created_at'), now()) as source_updated_at
        from src as s
      )
      select
        m.product_id,
        coalesce(q.display_name, m.display_name)::text,
        coalesce(q.brand_name, m.brand_name)::text,
        coalesce(q.product_type, m.product_type)::text,
        coalesce(q.source_provider, m.source_provider)::text,
        coalesce(q.source_url, m.source_url)::text,
        coalesce(q.main_image_url, m.main_image_url)::text,
        q.calories,
        coalesce(q.confidence, 0)::integer,
        coalesce(q.has_image, nullif(coalesce(q.main_image_url, m.main_image_url), '') is not null) as has_image,
        coalesce(q.has_nutrition, q.calories is not null) as has_nutrition,
        coalesce(q.has_verified_source, nullif(coalesce(q.source_url, m.source_url), '') is not null) as has_verified_source,
        coalesce(q.quality_score,
          (case when nullif(coalesce(q.main_image_url, m.main_image_url), '') is not null then 25 else 0 end
          + case when nullif(coalesce(q.source_url, m.source_url), '') is not null then 25 else 0 end)::integer
        ) as quality_score,
        coalesce(q.missing_fields, array_remove(array[
          case when nullif(coalesce(q.main_image_url, m.main_image_url), '') is null then 'image' end,
          'nutrition',
          case when nullif(coalesce(q.source_url, m.source_url), '') is null then 'verified_source' end
        ], null)::text[]) as missing_fields,
        coalesce(q.status, 'needs_review')::text,
        coalesce(q.updated_at, q.last_checked_at, m.source_updated_at, now()) as updated_at
      from mapped as m
      left join public.loop_product_quality_snapshots as q on q.card_id = m.product_id
      order by quality_score asc, updated_at desc
      limit %s
    $sql$, v_limit);
    return;
  end if;

  return;
end;
$$;

grant execute on function public.loop_admin_products_list(integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- AI model/tier routing config. Store key ENV NAMES, never secret values.
-- ---------------------------------------------------------------------------

create table if not exists public.loop_ai_model_routes (
  route_key text primary key,
  display_name text not null,
  task_kind text not null,
  default_model text not null,
  fallback_model text,
  default_api_key_env text not null default 'OPENAI_API_KEY',
  recommended_effort text not null default 'normal',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.loop_tier_ai_model_config (
  id uuid primary key default gen_random_uuid(),
  tier_key text not null,
  route_key text not null references public.loop_ai_model_routes(route_key) on delete cascade,
  provider text not null default 'openai',
  model text not null,
  api_key_env_name text not null default 'OPENAI_API_KEY',
  daily_limit integer,
  monthly_budget_pence integer,
  enabled boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tier_key, route_key)
);

insert into public.loop_ai_model_routes(route_key, display_name, task_kind, default_model, fallback_model, default_api_key_env, recommended_effort, notes)
values
  ('quick_runtime', 'Quick runtime/admin issue checks', 'quick_runtime', 'gpt-4.1-mini', 'gpt-4.1-mini', 'OPENAI_API_KEY', 'low', 'Cheap, fast checks and non-critical suggestions.'),
  ('security_review', 'Security and high severity diagnostics', 'security_review', 'gpt-4.1', 'gpt-4.1-mini', 'OPENAI_SECURITY_API_KEY', 'high', 'Use stronger models and a separate key/budget for security-sensitive issues.'),
  ('product_enrichment', 'Product and nutrition enrichment', 'product_enrichment', 'gpt-4.1-mini', 'gpt-4.1-mini', 'OPENAI_API_KEY', 'normal', 'High-volume product quality filling and source extraction.'),
  ('investment_research', 'Investment/source coverage research', 'investment_research', 'gpt-4.1-mini', 'gpt-4.1-mini', 'OPENAI_API_KEY', 'normal', 'Market/source research, delayed data coverage and SQL generation.'),
  ('vision_label_scan', 'Vision / label scan', 'vision_label_scan', 'gpt-4.1-mini', 'gpt-4.1-mini', 'OPENAI_API_KEY', 'normal', 'Photos, labels and image-backed product checks.')
on conflict (route_key) do update set
  display_name = excluded.display_name,
  task_kind = excluded.task_kind,
  default_model = excluded.default_model,
  fallback_model = excluded.fallback_model,
  default_api_key_env = excluded.default_api_key_env,
  recommended_effort = excluded.recommended_effort,
  notes = excluded.notes,
  updated_at = now();

insert into public.loop_tier_ai_model_config(tier_key, route_key, provider, model, api_key_env_name, daily_limit, monthly_budget_pence, notes)
select seed.tier_key, seed.route_key, 'openai', seed.model, seed.api_key_env_name, seed.daily_limit, seed.monthly_budget_pence, seed.notes
from (values
  ('free','quick_runtime','gpt-4.1-mini','OPENAI_API_KEY',25,100,'Free tier uses cheap quick checks.'),
  ('free','product_enrichment','gpt-4.1-mini','OPENAI_API_KEY',50,250,'Free product help is capped.'),
  ('free','investment_research','gpt-4.1-mini','OPENAI_API_KEY',10,100,'Free investment coverage is delayed/manual.'),
  ('premium','quick_runtime','gpt-4.1-mini','OPENAI_PREMIUM_API_KEY',500,2500,'Premium has higher quick-check limits.'),
  ('premium','product_enrichment','gpt-4.1-mini','OPENAI_PREMIUM_API_KEY',1000,5000,'Premium can run more enrichment.'),
  ('premium','investment_research','gpt-4.1','OPENAI_PREMIUM_API_KEY',250,7500,'Premium can use stronger investment research.'),
  ('premium','security_review','gpt-4.1','OPENAI_SECURITY_API_KEY',100,10000,'Security always uses stronger model lane.'),
  ('staff','quick_runtime','gpt-4.1-mini','OPENAI_API_KEY',5000,null,'Internal staff/admin.'),
  ('staff','security_review','gpt-4.1','OPENAI_SECURITY_API_KEY',1000,null,'Internal security/admin.'),
  ('staff','investment_research','gpt-4.1','OPENAI_PREMIUM_API_KEY',1000,null,'Internal investment admin.')
) as seed(tier_key, route_key, model, api_key_env_name, daily_limit, monthly_budget_pence, notes)
on conflict (tier_key, route_key) do nothing;

-- ---------------------------------------------------------------------------
-- Investment AI coverage request ledger and generated SQL storage.
-- ---------------------------------------------------------------------------

create table if not exists public.loop_investment_ai_market_requests (
  id uuid primary key default gen_random_uuid(),
  prompt text not null,
  inferred_market_code text,
  inferred_market_name text,
  inferred_country_code text,
  inferred_currency_code text,
  generated_sql text,
  status text not null default 'planned',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loop_investment_ai_market_requests_status_check check (status in ('planned','sql_generated','applied','rejected'))
);

create index if not exists loop_investment_ai_market_requests_status_idx
on public.loop_investment_ai_market_requests(status, created_at desc);

grant select, insert, update on public.loop_ai_model_routes to authenticated;
grant select, insert, update on public.loop_tier_ai_model_config to authenticated;
grant select, insert, update on public.loop_investment_ai_market_requests to authenticated;
