-- LOOP v27.77 single safe SQL repair / audit
--
-- Use this after partial/manual migration runs where v27_72, v27_73, v27_74 or v27_75 failed.
-- Do NOT run the older failing individual files again first.
--
-- This is deliberately defensive:
-- - creates/repairs the objects the app needs from v27.72-v27.75
-- - fixes the gen_random_bytes search_path issue
-- - widens mortgage/home numeric fields
-- - avoids invalid expression unique constraints such as unique(lower(alias))
-- - includes one consolidated healthcheck at the end

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

-- Safe wrapper for older code/functions that call gen_random_bytes(integer) without the extensions schema.
-- Some Supabase projects already expose public.gen_random_bytes(integer). If it exists, we leave it alone.
-- If another migration created it between the existence check and CREATE, duplicate_function is swallowed.
do $$
begin
  if to_regprocedure('public.gen_random_bytes(integer)') is null then
    begin
      execute $fn$
        create function public.gen_random_bytes(p_length integer)
        returns bytea
        language plpgsql
        volatile
        as $body$
        declare
          v_out bytea;
          v_hex text := '';
        begin
          begin
            execute 'select extensions.gen_random_bytes($1)' into v_out using p_length;
            return v_out;
          exception when others then
            -- fall through to deterministic fallback below
          end;

          while length(v_hex) < greatest(1, p_length) * 2 loop
            v_hex := v_hex || md5(random()::text || clock_timestamp()::text || txid_current()::text);
          end loop;

          return decode(substr(v_hex, 1, greatest(1, p_length) * 2), 'hex');
        end;
        $body$
      $fn$;
    exception
      when duplicate_function then
        null;
    end;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- v27.63/v27.64 old syntax repair: food aliases without unique(lower(alias))
-- ---------------------------------------------------------------------------
create table if not exists public.app_food_product_aliases (
  id uuid primary key default gen_random_uuid(),
  alias text not null,
  alias_key text,
  canonical_name text not null,
  brand_name text,
  product_family text,
  confidence integer not null default 60,
  created_at timestamptz not null default now()
);

alter table public.app_food_product_aliases
  add column if not exists alias_key text;

update public.app_food_product_aliases
set alias_key = lower(trim(alias))
where alias_key is null or alias_key = '';

create unique index if not exists app_food_product_aliases_alias_key_idx
on public.app_food_product_aliases(alias_key);

-- ---------------------------------------------------------------------------
-- Mortgage/home numeric overflow repair
-- ---------------------------------------------------------------------------
create table if not exists public.homes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  label text not null default 'Home',
  property_value numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.homes
  add column if not exists property_value numeric(14,2) default 0,
  add column if not exists purchase_price numeric(14,2),
  add column if not exists estimated_value_low numeric(14,2),
  add column if not exists estimated_value_mid numeric(14,2),
  add column if not exists estimated_value_high numeric(14,2),
  add column if not exists target_purchase_price numeric(14,2),
  add column if not exists target_extra_cash numeric(14,2),
  add column if not exists target_interest_rate numeric(8,4),
  add column if not exists target_term_years numeric(8,2);

alter table public.homes
  alter column property_value type numeric(14,2) using nullif(property_value::text,'')::numeric,
  alter column purchase_price type numeric(14,2) using nullif(purchase_price::text,'')::numeric,
  alter column estimated_value_low type numeric(14,2) using nullif(estimated_value_low::text,'')::numeric,
  alter column estimated_value_mid type numeric(14,2) using nullif(estimated_value_mid::text,'')::numeric,
  alter column estimated_value_high type numeric(14,2) using nullif(estimated_value_high::text,'')::numeric,
  alter column target_purchase_price type numeric(14,2) using nullif(target_purchase_price::text,'')::numeric,
  alter column target_extra_cash type numeric(14,2) using nullif(target_extra_cash::text,'')::numeric,
  alter column target_interest_rate type numeric(8,4) using nullif(target_interest_rate::text,'')::numeric,
  alter column target_term_years type numeric(8,2) using nullif(target_term_years::text,'')::numeric;

create table if not exists public.home_mortgage_deals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  home_id uuid,
  lender text,
  product_name text,
  balance numeric(14,2) not null default 0,
  balance_as_of_date date,
  interest_rate numeric(8,4) not null default 0,
  rate_type text not null default 'fixed',
  repayment_type text not null default 'repayment',
  initial_period_end date,
  term_years numeric(8,2) not null default 25,
  monthly_payment_override numeric(14,2),
  start_date date,
  end_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.home_mortgage_deals
  add column if not exists balance numeric(14,2) not null default 0,
  add column if not exists interest_rate numeric(8,4) not null default 0,
  add column if not exists term_years numeric(8,2) not null default 25,
  add column if not exists monthly_payment_override numeric(14,2),
  add column if not exists repayment_type text not null default 'repayment',
  add column if not exists rate_type text not null default 'fixed';

alter table public.home_mortgage_deals
  alter column balance type numeric(14,2) using nullif(balance::text,'')::numeric,
  alter column interest_rate type numeric(8,4) using nullif(interest_rate::text,'')::numeric,
  alter column term_years type numeric(8,2) using nullif(term_years::text,'')::numeric,
  alter column monthly_payment_override type numeric(14,2) using nullif(monthly_payment_override::text,'')::numeric;

alter table public.home_mortgage_deals
  drop constraint if exists home_mortgage_deals_repayment_type_check;

alter table public.home_mortgage_deals
  add constraint home_mortgage_deals_repayment_type_check
  check (repayment_type in ('repayment','interest_only','part_and_part'));

-- ---------------------------------------------------------------------------
-- v27.72 admin/security/money strategy core objects
-- ---------------------------------------------------------------------------
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
  created_at timestamptz not null default now()
);

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
  updated_at timestamptz not null default now()
);

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
  updated_at timestamptz not null default now()
);

create unique index if not exists loop_money_profiles_user_active_idx
on public.loop_money_profiles(user_id)
where status = 'active';

create table if not exists public.loop_money_savings_deals (
  id uuid primary key default gen_random_uuid(),
  provider_name text not null,
  product_name text not null,
  product_type text not null default 'regular_saver',
  rate_aer numeric not null default 0,
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
  updated_at timestamptz not null default now()
);

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
  created_at timestamptz not null default now()
);

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
  updated_at timestamptz not null default now()
);

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
  read_at timestamptz
);

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
  select greatest(0, round(
    coalesce(p_monthly_pence,0)
    * (coalesce(p_rate_aer,0) / 100.0)
    / 12.0
    * (greatest(1, coalesce(p_months,12)) * (greatest(1, coalesce(p_months,12)) + 1) / 2.0)
  ))::integer;
$$;

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
    least(coalesce(d.max_monthly_pence, v_profile.monthly_available_savings_pence), v_profile.monthly_available_savings_pence),
    greatest(0, v_profile.monthly_available_savings_pence - least(coalesce(d.max_monthly_pence, v_profile.monthly_available_savings_pence), v_profile.monthly_available_savings_pence)),
    public.loop_regular_saver_gross_interest_pence(least(coalesce(d.max_monthly_pence, v_profile.monthly_available_savings_pence), v_profile.monthly_available_savings_pence), d.rate_aer, coalesce(d.term_months, 12)),
    public.loop_regular_saver_gross_interest_pence(least(coalesce(d.max_monthly_pence, v_profile.monthly_available_savings_pence), v_profile.monthly_available_savings_pence), greatest(0, d.rate_aer - v_current_rate), coalesce(d.term_months, 12)),
    greatest(0, least(100,
      50
      + case when d.rate_aer > v_current_rate then 20 else -10 end
      + case when d.max_monthly_pence is null or d.max_monthly_pence >= least(v_profile.monthly_available_savings_pence, 20000) then 10 else 0 end
      + case when d.requires_switch then -15 else 0 end
      + case when d.requires_current_account then -8 else 0 end
      + case when d.access_type = 'easy_access' then 8 when d.access_type = 'restricted' then -3 else 0 end
    ))::integer,
    array_remove(array[
      case when d.requires_current_account then 'Requires a linked/current account' end,
      case when d.requires_switch then 'May require a current account switch' end,
      case when d.requires_direct_debits then 'May require direct debits' end,
      case when d.requires_min_monthly_pay_in then 'May require minimum monthly pay-in' end,
      case when d.new_customers_only then 'May be new customers only' end,
      case when d.max_monthly_pence is not null and d.max_monthly_pence < v_profile.monthly_available_savings_pence then 'Only part of your monthly savings fits this deal' end,
      case when d.rate_last_checked_at is null or d.rate_last_checked_at < now() - interval '2 days' then 'Rate/source needs a fresh check before acting' end
    ], null)::text[],
    case
      when d.rate_aer > v_current_rate and d.max_monthly_pence is not null
        then 'Higher-rate option for part of your monthly savings; use remaining money elsewhere.'
      when d.rate_aer > v_current_rate
        then 'Higher-rate option than your current average cash rate.'
      else 'Available product, but it may not beat your current average rate.'
    end,
    d.opening_url,
    d.source_url,
    d.rate_last_checked_at
  from public.loop_money_savings_deals d
  where d.status = 'active'
    and coalesce(d.availability_status, 'available') = 'available'
    and coalesce(d.public_visibility, 'visible') = 'visible'
    and d.rate_aer is not null
    and (d.min_monthly_pence is null or d.min_monthly_pence <= v_profile.monthly_available_savings_pence)
  order by 9 desc, d.rate_aer desc;
end;
$$;

grant execute on function public.loop_regular_saver_gross_interest_pence(integer, numeric, integer) to authenticated;
grant execute on function public.loop_money_deal_candidates(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- v27.73 daily deal watch core objects
-- ---------------------------------------------------------------------------
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
  updated_at timestamptz not null default now()
);

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
  error text
);

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
  created_at timestamptz not null default now()
);

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
  v_new_status text;
  v_availability text;
  v_visibility text;
  v_event text;
begin
  select * into d from public.loop_money_savings_deals where id = p_deal_id for update;
  if d.id is null then
    raise exception 'Deal not found.';
  end if;

  if p_check_status = 'available' then
    v_new_status := 'active';
    v_availability := 'available';
    v_visibility := 'visible';
    v_event := case when p_rate_aer is not null and p_rate_aer <> d.rate_aer then 'rate_changed' else 'available_confirmed' end;

    update public.loop_money_savings_deals
    set status = v_new_status,
        availability_status = v_availability,
        public_visibility = v_visibility,
        rate_aer = coalesce(p_rate_aer, rate_aer),
        last_successful_check_at = now(),
        last_seen_available_at = now(),
        rate_last_checked_at = now(),
        last_check_status = p_check_status,
        last_check_detail = p_detail,
        stale_after_at = now() + interval '3 days',
        consecutive_unavailable_checks = 0,
        consecutive_failed_checks = 0,
        updated_at = now()
    where id = p_deal_id;
  elsif p_check_status in ('withdrawn','unavailable','not_found') then
    v_new_status := 'needs_review';
    v_availability := 'suspected_withdrawn';
    v_visibility := 'hidden';
    v_event := 'suspected_withdrawn';

    update public.loop_money_savings_deals
    set status = v_new_status,
        availability_status = v_availability,
        public_visibility = v_visibility,
        unavailable_detected_at = coalesce(unavailable_detected_at, now()),
        removed_reason = coalesce(p_detail, 'Source no longer shows this deal.'),
        last_check_status = p_check_status,
        last_check_detail = p_detail,
        rate_last_checked_at = now(),
        stale_after_at = now(),
        consecutive_unavailable_checks = coalesce(consecutive_unavailable_checks,0) + 1,
        consecutive_failed_checks = 0,
        updated_at = now()
    where id = p_deal_id;
  elsif p_check_status in ('blocked','rate_limited') then
    v_new_status := 'needs_review';
    v_availability := 'blocked';
    v_visibility := 'hidden';
    v_event := 'blocked';

    update public.loop_money_savings_deals
    set status = v_new_status,
        availability_status = v_availability,
        public_visibility = v_visibility,
        last_check_status = p_check_status,
        last_check_detail = p_detail,
        rate_last_checked_at = now(),
        stale_after_at = now(),
        consecutive_failed_checks = coalesce(consecutive_failed_checks,0) + 1,
        updated_at = now()
    where id = p_deal_id;
  else
    v_new_status := 'needs_review';
    v_availability := 'unknown';
    v_visibility := 'hidden';
    v_event := 'failed_check';

    update public.loop_money_savings_deals
    set status = v_new_status,
        availability_status = v_availability,
        public_visibility = v_visibility,
        last_check_status = p_check_status,
        last_check_detail = p_detail,
        rate_last_checked_at = now(),
        stale_after_at = now(),
        consecutive_failed_checks = coalesce(consecutive_failed_checks,0) + 1,
        updated_at = now()
    where id = p_deal_id;
  end if;

  insert into public.loop_money_deal_events(deal_id,event_kind,previous_status,new_status,previous_rate_aer,new_rate_aer,source_url,detail,payload)
  values (p_deal_id, v_event, d.status, v_new_status, d.rate_aer, coalesce(p_rate_aer,d.rate_aer), d.source_url, p_detail, coalesce(p_payload,'{}'::jsonb));

  return jsonb_build_object('ok', true, 'deal_id', p_deal_id, 'event', v_event, 'status', v_new_status, 'availability_status', v_availability, 'public_visibility', v_visibility);
end;
$$;

grant execute on function public.loop_money_apply_deal_check_result(uuid,text,numeric,text,jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- v27.74 admin ops, issue reports, uptime, investments, assets
-- ---------------------------------------------------------------------------
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

create table if not exists public.loop_admin_alert_events (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid references public.loop_admin_alerts(id) on delete cascade,
  event_kind text not null,
  note text,
  actor_user_id uuid references auth.users(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

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

create table if not exists public.loop_uptime_checks (
  id uuid primary key default gen_random_uuid(),
  target_id uuid references public.loop_uptime_targets(id) on delete cascade,
  status text not null,
  status_code integer,
  latency_ms integer,
  error text,
  checked_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

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

create table if not exists public.loop_investment_snaptrade_health (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'unknown',
  connections_checked integer not null default 0,
  successful_connections integer not null default 0,
  failed_connections integer not null default 0,
  last_error text,
  payload jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now()
);

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
  updated_at timestamptz not null default now()
);

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
  updated_at timestamptz not null default now()
);

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
  updated_at timestamptz not null default now()
);

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
  created_at timestamptz not null default now()
);

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
    set severity = p_severity,
        title = p_title,
        summary = p_summary,
        detail = p_detail,
        action_url = p_action_url,
        payload = coalesce(p_payload, '{}'::jsonb),
        last_seen_at = now(),
        next_check_at = now() + ((coalesce(p_check_cadence_minutes,1440)::text || ' minutes')::interval),
        check_cadence_minutes = coalesce(p_check_cadence_minutes,1440),
        updated_at = now()
    where id = v_id;
    return v_id;
  end if;

  insert into public.loop_admin_alerts(area,severity,alert_key,title,summary,detail,entity_kind,entity_id,action_url,dedupe_key,payload,next_check_at,check_cadence_minutes)
  values (p_area,p_severity,p_alert_key,p_title,p_summary,p_detail,p_entity_kind,p_entity_id,p_action_url,v_dedupe,coalesce(p_payload,'{}'::jsonb),now() + ((coalesce(p_check_cadence_minutes,1440)::text || ' minutes')::interval),coalesce(p_check_cadence_minutes,1440))
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.loop_admin_attention_summary()
returns table(area text, open_count integer, high_count integer, critical_count integer, newest_at timestamptz)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select
    a.area,
    count(*)::integer,
    count(*) filter (where a.severity = 'high')::integer,
    count(*) filter (where a.severity = 'critical')::integer,
    max(a.last_seen_at)
  from public.loop_admin_alerts a
  where a.status in ('open','watching','needs_admin_review','in_progress')
  group by a.area
  order by 4 desc, 3 desc, 2 desc;
$$;

grant execute on function public.loop_admin_raise_alert(text,text,text,text,text,text,text,text,text,jsonb,integer) to authenticated;
grant execute on function public.loop_admin_attention_summary() to authenticated;

-- ---------------------------------------------------------------------------
-- v27.75 property estimate mode
-- ---------------------------------------------------------------------------
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
  add column if not exists source_confidence_summary jsonb not null default '{}'::jsonb;

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
  source_name = excluded.source_name,
  source_area = excluded.source_area,
  source_kind = excluded.source_kind,
  required_for_beta = excluded.required_for_beta,
  required_for_live = excluded.required_for_live,
  account_needed = excluded.account_needed,
  env_keys = excluded.env_keys,
  status = excluded.status,
  setup_notes = excluded.setup_notes,
  use_in_beta = excluded.use_in_beta,
  limitations = excluded.limitations,
  sort_order = excluded.sort_order,
  updated_at = now();

create table if not exists public.loop_council_tax_band_rules (
  id uuid primary key default gen_random_uuid(),
  country_code text not null,
  valuation_date date not null,
  band text not null,
  min_value_pence integer,
  max_value_pence integer,
  sort_order integer not null
);

create unique index if not exists loop_council_tax_band_rules_country_band_idx
on public.loop_council_tax_band_rules(country_code, band);

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

create unique index if not exists loop_council_tax_rate_estimates_key_idx
on public.loop_council_tax_rate_estimates(coalesce(local_authority_code,'DEFAULT'), country_code, band, charge_year);

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

-- ---------------------------------------------------------------------------
-- Light RLS enablement and permissive owner/admin policies for newly repaired tables
-- ---------------------------------------------------------------------------
alter table public.loop_money_profiles enable row level security;
alter table public.loop_money_savings_deals enable row level security;
alter table public.loop_money_notifications enable row level security;
alter table public.loop_admin_alerts enable row level security;
alter table public.loop_user_issue_reports enable row level security;
alter table public.loop_household_properties enable row level security;
alter table public.loop_household_vehicles enable row level security;
alter table public.loop_property_estimate_runs enable row level security;

drop policy if exists "loop money profiles owner admin" on public.loop_money_profiles;
create policy "loop money profiles owner admin" on public.loop_money_profiles
for all to authenticated using (user_id = auth.uid() or public.loop_is_platform_admin())
with check (user_id = auth.uid() or public.loop_is_platform_admin());

drop policy if exists "loop money deals read active" on public.loop_money_savings_deals;
create policy "loop money deals read active" on public.loop_money_savings_deals
for select to authenticated using (status in ('active','needs_review') or public.loop_is_platform_admin());

drop policy if exists "loop money deals admin write" on public.loop_money_savings_deals;
create policy "loop money deals admin write" on public.loop_money_savings_deals
for all to authenticated using (public.loop_is_platform_admin())
with check (public.loop_is_platform_admin());

drop policy if exists "loop admin alerts admin" on public.loop_admin_alerts;
create policy "loop admin alerts admin" on public.loop_admin_alerts
for all to authenticated using (public.loop_is_platform_admin())
with check (public.loop_is_platform_admin());

drop policy if exists "loop issue reports owner admin read" on public.loop_user_issue_reports;
create policy "loop issue reports owner admin read" on public.loop_user_issue_reports
for select to authenticated using (user_id = auth.uid() or public.loop_is_platform_admin());

drop policy if exists "loop issue reports owner insert" on public.loop_user_issue_reports;
create policy "loop issue reports owner insert" on public.loop_user_issue_reports
for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "loop household properties owner admin" on public.loop_household_properties;
create policy "loop household properties owner admin" on public.loop_household_properties
for all to authenticated using (owner_user_id = auth.uid() or public.loop_is_platform_admin())
with check (owner_user_id = auth.uid() or public.loop_is_platform_admin());

drop policy if exists "loop household vehicles owner admin" on public.loop_household_vehicles;
create policy "loop household vehicles owner admin" on public.loop_household_vehicles
for all to authenticated using (owner_user_id = auth.uid() or public.loop_is_platform_admin())
with check (owner_user_id = auth.uid() or public.loop_is_platform_admin());

drop policy if exists "loop property estimate runs owner admin" on public.loop_property_estimate_runs;
create policy "loop property estimate runs owner admin" on public.loop_property_estimate_runs
for all to authenticated using (user_id = auth.uid() or public.loop_is_platform_admin())
with check (user_id = auth.uid() or public.loop_is_platform_admin());

-- ---------------------------------------------------------------------------
-- Consolidated healthcheck
-- ---------------------------------------------------------------------------
create or replace function public.loop_v2777_sql_audit_repair_healthcheck()
returns table(section text, check_name text, ok boolean, detail text)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select 'extensions','pgcrypto available',
    exists(select 1 from pg_extension where extname = 'pgcrypto'),
    'Needed for random tokens/invites.'
  union all select 'household','public gen_random_bytes wrapper',
    exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='gen_random_bytes'),
    'Fixes household QR invite function search_path issue.'
  union all select 'mortgage','mortgage balance widened',
    exists(select 1 from information_schema.columns where table_schema='public' and table_name='home_mortgage_deals' and column_name='balance' and numeric_precision >= 14),
    'Fixes numeric overflow for normal mortgage balances.'
  union all select 'food','alias unique syntax fixed',
    exists(select 1 from information_schema.columns where table_schema='public' and table_name='app_food_product_aliases' and column_name='alias_key'),
    'Uses alias_key unique index instead of invalid expression unique constraint.'
  union all select 'money','money profile table',
    to_regclass('public.loop_money_profiles') is not null,
    'v27.72 money profiles exist.'
  union all select 'money','savings deal table',
    to_regclass('public.loop_money_savings_deals') is not null,
    'v27.72/v27.73 savings deal lifecycle exists.'
  union all select 'money','deal candidate RPC',
    exists(select 1 from pg_proc where proname='loop_money_deal_candidates'),
    'User money strategy can generate deal candidates.'
  union all select 'deals','daily run logs',
    to_regclass('public.loop_money_deal_daily_runs') is not null,
    'v27.73 daily deal watch exists.'
  union all select 'admin','admin alerts',
    to_regclass('public.loop_admin_alerts') is not null,
    'v27.74 admin notifications dashboard table exists.'
  union all select 'admin','admin alert RPC',
    exists(select 1 from pg_proc where proname='loop_admin_raise_alert'),
    'Admin issue/deal/product alerts can be created.'
  union all select 'uptime','uptime target table',
    to_regclass('public.loop_uptime_targets') is not null,
    'v27.74 uptime checker exists.'
  union all select 'products','product quality table',
    to_regclass('public.loop_product_quality_snapshots') is not null,
    'v27.74 product quality tile table exists.'
  union all select 'investment','investment coverage table',
    to_regclass('public.loop_investment_coverage_sources') is not null,
    'v27.74 investment coverage monitoring exists.'
  union all select 'assets','household properties',
    to_regclass('public.loop_household_properties') is not null,
    'Property/household asset table exists.'
  union all select 'assets','household vehicles',
    to_regclass('public.loop_household_vehicles') is not null,
    'Vehicle/household asset table exists.'
  union all select 'property','property source checklist',
    to_regclass('public.loop_property_data_sources') is not null,
    'v27.75 property API/account checklist exists.'
  union all select 'property','council tax estimate fields',
    exists(select 1 from information_schema.columns where table_schema='public' and table_name='loop_household_properties' and column_name='estimated_council_tax_band'),
    'v27.75 estimate-first property fields exist.'
  union all select 'property','band rules seeded',
    exists(select 1 from public.loop_council_tax_band_rules where country_code='ENG' and band='D'),
    'Council-tax estimate band thresholds exist.'
  union all select 'property','estimate run table',
    to_regclass('public.loop_property_estimate_runs') is not null,
    'Property estimate run history exists.'
$$;

grant execute on function public.loop_v2777_sql_audit_repair_healthcheck() to anon, authenticated;
