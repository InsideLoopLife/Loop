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
