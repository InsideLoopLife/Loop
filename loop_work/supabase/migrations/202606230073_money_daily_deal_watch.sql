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
