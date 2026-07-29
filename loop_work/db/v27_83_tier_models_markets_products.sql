-- v27.83: editable tier AI budgets, provider/model choices, market seed coverage and full product admin coverage


-- Helpers used by column-safe product RPCs.
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
-- Provider-aware AI routes. billing_scope=user_tier means requests are charged
-- against the individual user's daily/monthly allowance. billing_scope=system is
-- admin/platform work and should not consume customer budgets.
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

alter table public.loop_ai_model_routes
  add column if not exists billing_scope text not null default 'system';

alter table public.loop_ai_model_routes
  drop constraint if exists loop_ai_model_routes_billing_scope_check;
alter table public.loop_ai_model_routes
  add constraint loop_ai_model_routes_billing_scope_check check (billing_scope in ('system','user_tier'));

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

alter table public.loop_tier_ai_model_config
  drop constraint if exists loop_tier_ai_model_config_provider_check;
alter table public.loop_tier_ai_model_config
  add constraint loop_tier_ai_model_config_provider_check check (provider in ('openai','anthropic','google','manual'));

insert into public.loop_ai_model_routes(route_key, display_name, task_kind, default_model, fallback_model, default_api_key_env, recommended_effort, billing_scope, notes)
values
  ('profile_insight', 'Profile insight', 'profile_insight', 'gpt-4.1-mini', 'gpt-4.1-mini', 'OPENAI_API_KEY', 'normal', 'user_tier', 'Customer-facing profile summaries and how-am-I-doing insight.'),
  ('nutrition_recommendation', 'Nutrition recommendations', 'nutrition_recommendation', 'gpt-4.1-mini', 'gpt-4.1-mini', 'OPENAI_API_KEY', 'normal', 'user_tier', 'Customer-facing food log, recommendation and substitution insight.'),
  ('property_insight', 'House/property insight', 'property_insight', 'gpt-4.1-mini', 'gpt-4.1-mini', 'OPENAI_API_KEY', 'normal', 'user_tier', 'Customer-facing property, mortgage and affordability insight.'),
  ('quick_runtime', 'Quick runtime/admin issue checks', 'quick_runtime', 'gpt-4.1-mini', 'gpt-4.1-mini', 'OPENAI_API_KEY', 'low', 'system', 'Cheap, fast checks and non-critical suggestions.'),
  ('security_review', 'Security and high severity diagnostics', 'security_review', 'gpt-4.1', 'gpt-4.1-mini', 'OPENAI_SECURITY_API_KEY', 'high', 'system', 'Use a stronger model and separate key/budget for security-sensitive issues.'),
  ('product_enrichment', 'Product and nutrition enrichment', 'product_enrichment', 'gpt-4.1-mini', 'gpt-4.1-mini', 'OPENAI_API_KEY', 'normal', 'system', 'High-volume product quality filling and source extraction.'),
  ('investment_research', 'Investment/source coverage research', 'investment_research', 'gpt-4.1-mini', 'gpt-4.1-mini', 'OPENAI_API_KEY', 'normal', 'system', 'Market/source research, delayed data coverage and SQL generation.'),
  ('vision_label_scan', 'Vision / label scan', 'vision_label_scan', 'gpt-4.1-mini', 'gpt-4.1-mini', 'OPENAI_API_KEY', 'normal', 'system', 'Photos, labels and image-backed product checks.')
on conflict (route_key) do update set
  display_name = excluded.display_name,
  task_kind = excluded.task_kind,
  default_model = excluded.default_model,
  fallback_model = excluded.fallback_model,
  default_api_key_env = excluded.default_api_key_env,
  recommended_effort = excluded.recommended_effort,
  billing_scope = excluded.billing_scope,
  notes = excluded.notes,
  updated_at = now();

-- Conservative starting limits; change these in Admin > Tiers using the cog.
insert into public.loop_tier_ai_model_config(tier_key, route_key, provider, model, api_key_env_name, daily_limit, monthly_budget_pence, enabled, notes)
select seed.tier_key, seed.route_key, seed.provider, seed.model, seed.api_key_env_name, seed.daily_limit, seed.monthly_budget_pence, true, seed.notes
from (values
  ('free','profile_insight','openai','gpt-4.1-mini','OPENAI_API_KEY',5,25,'Free profile AI is deliberately tight to control cost.'),
  ('free','nutrition_recommendation','openai','gpt-4.1-mini','OPENAI_API_KEY',5,25,'Free nutrition AI is deliberately tight to control cost.'),
  ('free','property_insight','openai','gpt-4.1-mini','OPENAI_API_KEY',2,20,'Free property AI is deliberately tight to control cost.'),
  ('plus','profile_insight','openai','gpt-4.1-mini','OPENAI_API_KEY',35,250,'Plus profile insight allowance.'),
  ('plus','nutrition_recommendation','openai','gpt-4.1-mini','OPENAI_API_KEY',35,250,'Plus nutrition recommendation allowance.'),
  ('plus','property_insight','openai','gpt-4.1-mini','OPENAI_API_KEY',10,200,'Plus property insight allowance.'),
  ('pro','profile_insight','openai','gpt-4.1','OPENAI_PREMIUM_API_KEY',100,900,'Pro profile insight can use stronger models.'),
  ('pro','nutrition_recommendation','openai','gpt-4.1','OPENAI_PREMIUM_API_KEY',100,900,'Pro nutrition recommendation can use stronger models.'),
  ('pro','property_insight','openai','gpt-4.1','OPENAI_PREMIUM_API_KEY',35,700,'Pro property insight can use stronger models.'),
  ('_system','quick_runtime','openai','gpt-4.1-mini','OPENAI_API_KEY',1000,5000,'System quick checks.'),
  ('_system','security_review','openai','gpt-4.1','OPENAI_SECURITY_API_KEY',100,10000,'System security diagnostics; switch provider to Claude/Gemini if preferred.'),
  ('_system','product_enrichment','openai','gpt-4.1-mini','OPENAI_API_KEY',2000,10000,'System product enrichment.'),
  ('_system','investment_research','openai','gpt-4.1-mini','OPENAI_API_KEY',500,5000,'System investment coverage research.'),
  ('_system','vision_label_scan','openai','gpt-4.1-mini','OPENAI_API_KEY',1000,10000,'System vision label scan.')
) as seed(tier_key, route_key, provider, model, api_key_env_name, daily_limit, monthly_budget_pence, notes)
on conflict (tier_key, route_key) do update set
  provider = coalesce(public.loop_tier_ai_model_config.provider, excluded.provider),
  model = coalesce(public.loop_tier_ai_model_config.model, excluded.model),
  api_key_env_name = coalesce(public.loop_tier_ai_model_config.api_key_env_name, excluded.api_key_env_name),
  daily_limit = coalesce(public.loop_tier_ai_model_config.daily_limit, excluded.daily_limit),
  monthly_budget_pence = coalesce(public.loop_tier_ai_model_config.monthly_budget_pence, excluded.monthly_budget_pence),
  updated_at = now();

create table if not exists public.loop_ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tier_key text not null default 'free',
  route_key text not null,
  provider text not null default 'openai',
  model text not null,
  estimated_input_tokens integer not null default 0,
  estimated_output_tokens integer not null default 0,
  estimated_cost_pence integer not null default 0,
  request_status text not null default 'completed',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists loop_ai_usage_events_user_route_day_idx
on public.loop_ai_usage_events(user_id, route_key, created_at desc);

alter table public.loop_ai_usage_events enable row level security;

drop policy if exists "ai usage admin read" on public.loop_ai_usage_events;
create policy "ai usage admin read" on public.loop_ai_usage_events
for select to authenticated using (public.loop_is_platform_admin() or user_id = auth.uid());

drop policy if exists "ai usage insert own" on public.loop_ai_usage_events;
create policy "ai usage insert own" on public.loop_ai_usage_events
for insert to authenticated with check (public.loop_is_platform_admin() or user_id = auth.uid());

create or replace function public.loop_check_ai_entitlement(
  p_user_id uuid,
  p_tier_key text,
  p_route_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_config record;
  v_used_today integer := 0;
  v_spent_month integer := 0;
  v_remaining_today integer;
  v_remaining_budget integer;
begin
  select * into v_config
  from public.loop_tier_ai_model_config c
  where c.tier_key = coalesce(nullif(p_tier_key,''), 'free')
    and c.route_key = p_route_key
    and c.enabled = true
  limit 1;

  if not found then
    select * into v_config
    from public.loop_tier_ai_model_config c
    where c.tier_key = 'free'
      and c.route_key = p_route_key
      and c.enabled = true
    limit 1;
  end if;

  if not found then
    return jsonb_build_object('allowed', false, 'reason', 'No enabled AI route config for this tier/route.');
  end if;

  select count(*)::integer into v_used_today
  from public.loop_ai_usage_events e
  where e.user_id = p_user_id
    and e.route_key = p_route_key
    and e.created_at >= date_trunc('day', now());

  select coalesce(sum(e.estimated_cost_pence), 0)::integer into v_spent_month
  from public.loop_ai_usage_events e
  where e.user_id = p_user_id
    and e.route_key = p_route_key
    and e.created_at >= date_trunc('month', now());

  v_remaining_today := case when v_config.daily_limit is null then null else greatest(v_config.daily_limit - v_used_today, 0) end;
  v_remaining_budget := case when v_config.monthly_budget_pence is null then null else greatest(v_config.monthly_budget_pence - v_spent_month, 0) end;

  return jsonb_build_object(
    'allowed',
      coalesce(v_config.enabled, false)
      and (v_config.daily_limit is null or v_used_today < v_config.daily_limit)
      and (v_config.monthly_budget_pence is null or v_spent_month < v_config.monthly_budget_pence),
    'reason', case
      when not coalesce(v_config.enabled, false) then 'AI route is disabled for this tier.'
      when v_config.daily_limit is not null and v_used_today >= v_config.daily_limit then 'Daily request limit reached for this user.'
      when v_config.monthly_budget_pence is not null and v_spent_month >= v_config.monthly_budget_pence then 'Monthly AI budget reached for this user.'
      else 'Allowed.'
    end,
    'tier_key', v_config.tier_key,
    'route_key', v_config.route_key,
    'provider', v_config.provider,
    'model', v_config.model,
    'api_key_env_name', v_config.api_key_env_name,
    'daily_limit', v_config.daily_limit,
    'monthly_budget_pence', v_config.monthly_budget_pence,
    'used_today', v_used_today,
    'spent_this_month_pence', v_spent_month,
    'remaining_today', v_remaining_today,
    'remaining_budget_pence', v_remaining_budget
  );
end;
$$;

grant execute on function public.loop_check_ai_entitlement(uuid,text,text) to authenticated;
grant select, insert, update on public.loop_ai_model_routes to authenticated;
grant select, insert, update on public.loop_tier_ai_model_config to authenticated;
grant select, insert on public.loop_ai_usage_events to authenticated;

-- Keep the visible tier cards conservative. Admin can edit afterwards.
update public.loop_plan_features
set limit_value = 5, updated_at = now()
where tier_key = 'free' and feature_key = 'ai_daily_requests' and coalesce(limit_value, 0) > 5;

-- ---------------------------------------------------------------------------
-- Investment coverage defaults and tighter auto-population.
-- ---------------------------------------------------------------------------

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
  updated_at timestamptz not null default now()
);

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
  updated_at timestamptz not null default now()
);

insert into public.loop_investment_markets(market_code, market_name, country_code, currency_code, enabled, coverage_status, requested_reason, ai_next_update_note)
values
  ('LSE', 'London Stock Exchange', 'GB', 'GBP', true, 'manual', 'Seeded because UK shares/ETFs are supported by the investment module.', 'Review delayed-price provider and GBX/GBP mapping.'),
  ('AIM', 'Alternative Investment Market', 'GB', 'GBP', true, 'manual', 'Seeded because UK smaller-cap holdings can appear via LSE/AIM.', 'Review delayed-price provider and GBX/GBP mapping.'),
  ('NASDAQ', 'Nasdaq', 'US', 'USD', true, 'manual', 'Seeded because US stocks and ETFs are supported by ticker-based holdings.', 'Review delayed/realtime provider entitlement.'),
  ('NYSE', 'New York Stock Exchange', 'US', 'USD', true, 'manual', 'Seeded because US stocks and ETFs are supported by ticker-based holdings.', 'Review delayed/realtime provider entitlement.'),
  ('VANGUARD', 'Vanguard UK fund prices', 'GB', 'GBP', true, 'manual', 'Seeded because provider fund NAV logic exists for Vanguard funds.', 'Keep provider-fund NAV mapping separate from share exchange mapping.')
on conflict (market_code) do update set
  market_name = excluded.market_name,
  country_code = coalesce(public.loop_investment_markets.country_code, excluded.country_code),
  currency_code = coalesce(public.loop_investment_markets.currency_code, excluded.currency_code),
  enabled = true,
  coverage_status = case when public.loop_investment_markets.coverage_status = 'planned' then excluded.coverage_status else public.loop_investment_markets.coverage_status end,
  ai_next_update_note = coalesce(public.loop_investment_markets.ai_next_update_note, excluded.ai_next_update_note),
  updated_at = now();

insert into public.loop_investment_coverage_sources(source_name, source_kind, source_url, markets, checks_stocks, check_frequency_minutes, enabled, stocks_referenced, notes)
values
  ('Built-in delayed/manual share coverage', 'admin_list', null, array['LSE','AIM','NASDAQ','NYSE']::text[], true, 1440, true, 0, 'Seeded default coverage; counts should be increased by cron/source checks.'),
  ('Provider fund NAV coverage', 'admin_list', null, array['VANGUARD']::text[], false, 1440, true, 0, 'Seeded default provider-fund coverage.')
on conflict do nothing;

do $$
declare
  v_market_expr text;
begin
  if to_regclass('public.investment_holdings') is not null then
    select string_agg(format('nullif(%I::text, '''')', c.column_name), ', ' order by p.priority)
      into v_market_expr
    from (values
      ('exchange', 1),
      ('native_exchange', 2),
      ('market_code', 3),
      ('market', 4),
      ('provider_name', 5),
      ('provider', 6)
    ) as p(column_name, priority)
    join information_schema.columns c
      on c.table_schema = 'public'
     and c.table_name = 'investment_holdings'
     and c.column_name = p.column_name;

    if v_market_expr is not null then
      execute format($dyn$
        insert into public.loop_investment_markets(market_code, market_name, country_code, currency_code, enabled, coverage_status, requested_reason, ai_next_update_note)
        select distinct
          upper(coalesce(%1$s)) as market_code,
          upper(coalesce(%1$s)) as market_name,
          null::text,
          null::text,
          true,
          'manual',
          'Detected from existing investment holdings.',
          'Detected from existing holdings; confirm provider mapping.'
        from public.investment_holdings
        where coalesce(%1$s) is not null
        on conflict (market_code) do nothing
      $dyn$, v_market_expr);
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Product admin: nutrition_cards + nutrition_ingredients, left-joined to
-- quality snapshots so a small snapshot table never hides the full user DB.
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

create or replace function public.loop_admin_products_list(p_limit integer default 5000)
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
  v_limit integer := greatest(1, least(coalesce(p_limit, 5000), 10000));
  v_parts text[] := array[]::text[];
  v_sql text;
begin
  if to_regclass('public.loop_nutrition_cards') is not null then
    v_parts := v_parts || $part$
      select
        c.id::uuid as product_id,
        coalesce(j ->> 'display_name', j ->> 'name', j ->> 'title', j ->> 'product_name', j ->> 'formal_name', 'Unnamed product')::text as display_name,
        coalesce(j ->> 'brand_name', j ->> 'brand', j ->> 'vendor', j ->> 'retailer_name')::text as brand_name,
        coalesce(j ->> 'product_type', j ->> 'card_kind', j ->> 'category', j ->> 'category_path')::text as product_type,
        coalesce(j ->> 'source_provider', j ->> 'source_kind', j ->> 'retailer_name', j ->> 'shop_tag')::text as source_provider,
        coalesce(j ->> 'source_url', j ->> 'url', j ->> 'product_url')::text as source_url,
        coalesce(j ->> 'main_image_url', j ->> 'image_url', j ->> 'image', j ->> 'thumbnail_url')::text as main_image_url,
        coalesce(public.loop_try_numeric(j ->> 'calories'), public.loop_try_numeric(j #>> '{nutrition,calories}'), public.loop_try_numeric(j #>> '{nutrition,kcal}'), public.loop_try_numeric(j ->> 'energy_kcal'))::numeric as calories,
        coalesce(public.loop_try_numeric(j ->> 'confidence'), public.loop_try_numeric(j ->> 'estimate_confidence'), public.loop_try_numeric(j ->> 'source_confidence'))::integer as confidence,
        coalesce(j ->> 'status', j ->> 'data_quality_status', 'active')::text as source_status,
        coalesce(public.loop_try_timestamptz(j ->> 'updated_at'), public.loop_try_timestamptz(j ->> 'created_at'), now()) as source_updated_at
      from (select id, to_jsonb(loop_nutrition_cards.*) as j from public.loop_nutrition_cards) c
    $part$;
  end if;

  if to_regclass('public.nutrition_ingredients') is not null then
    v_parts := v_parts || $part$
      select
        i.id::uuid as product_id,
        coalesce(j ->> 'label', j ->> 'display_name', j ->> 'name', 'Unnamed product')::text as display_name,
        coalesce(j ->> 'brand_name', j ->> 'brand')::text as brand_name,
        coalesce(j ->> 'source_type', 'ingredient')::text as product_type,
        coalesce(j ->> 'source_type', j ->> 'source_provider', 'ingredient')::text as source_provider,
        coalesce(j ->> 'source_url', j ->> 'url')::text as source_url,
        coalesce(j ->> 'image_url', j ->> 'main_image_url')::text as main_image_url,
        public.loop_try_numeric(j ->> 'calories')::numeric as calories,
        coalesce(public.loop_try_numeric(j ->> 'data_confidence'), public.loop_try_numeric(j ->> 'confidence'))::integer as confidence,
        'active'::text as source_status,
        coalesce(public.loop_try_timestamptz(j ->> 'last_used_at'), public.loop_try_timestamptz(j ->> 'updated_at'), public.loop_try_timestamptz(j ->> 'created_at'), now()) as source_updated_at
      from (select id, to_jsonb(nutrition_ingredients.*) as j from public.nutrition_ingredients) i
    $part$;
  end if;

  if array_length(v_parts, 1) is null then
    return;
  end if;

  v_sql := format($sql$
    with mapped as (%s), joined as (
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
      from mapped m
      left join public.loop_product_quality_snapshots q on q.card_id = m.product_id
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
        (case when nullif(j.main_image_url, '') is not null then 25 else 0 end
        + case when j.calories is not null then 35 else 0 end
        + case when nullif(j.source_url, '') is not null or nullif(j.source_provider, '') is not null then 25 else 0 end
        + case when coalesce(j.confidence, 0) >= 70 then 15 else 0 end)::integer
      ) as quality_score,
      coalesce(j.q_missing_fields, array_remove(array[
        case when nullif(j.main_image_url, '') is null then 'image' end,
        case when j.calories is null then 'nutrition' end,
        case when not (nullif(j.source_url, '') is not null or nullif(j.source_provider, '') is not null) then 'verified_source' end,
        case when coalesce(j.confidence, 0) < 70 then 'confidence' end
      ], null)::text[]) as missing_fields,
      j.status,
      j.updated_at
    from joined j
    order by quality_score asc, updated_at desc
    limit %s
  $sql$, array_to_string(v_parts, ' union all '), v_limit);

  return query execute v_sql;
end;
$$;

grant execute on function public.loop_admin_products_list(integer) to anon, authenticated;

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
begin
  if not public.loop_is_platform_admin() then
    return;
  end if;

  return query
  with base as (
    select * from public.loop_admin_products_list(10000)
  ), filtered as (
    select * from base
    where (p_search is null or p_search = ''
      or display_name ilike '%' || p_search || '%'
      or brand_name ilike '%' || p_search || '%'
      or source_url ilike '%' || p_search || '%'
      or source_provider ilike '%' || p_search || '%')
  )
  select
    f.product_id,
    f.display_name,
    f.brand_name,
    coalesce(f.product_type, 'product')::text as card_kind,
    f.source_url,
    f.main_image_url,
    f.updated_at as created_at,
    f.confidence,
    f.status,
    case when coalesce(f.quality_score, 0) >= 100 then 'complete' else 'needs_review' end::text as data_quality_status,
    f.missing_fields
  from filtered f
  order by
    case when p_sort = 'alpha' then f.display_name end asc nulls last,
    case when p_sort = 'alpha_desc' then f.display_name end desc nulls last,
    case when p_sort = 'confidence_low' then f.confidence end asc nulls first,
    case when p_sort = 'confidence_high' then f.confidence end desc nulls last,
    case when p_sort = 'added_asc' then f.updated_at end asc nulls last,
    f.updated_at desc nulls last
  limit greatest(1, least(coalesce(p_limit,100),1000))
  offset greatest(0, coalesce(p_offset,0));
end;
$$;

grant execute on function public.loop_admin_product_library(text,text,integer,integer) to authenticated;

notify pgrst, 'reload schema';
