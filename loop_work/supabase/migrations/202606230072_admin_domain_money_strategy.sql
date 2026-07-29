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

-- Note: no DROP FUNCTION here on purpose. Once other migrations add policies that reference
-- this function (which they do, extensively), a bare DROP fails with "cannot drop function
-- ... because other objects depend on it". CREATE OR REPLACE updates the body in place without
-- disturbing anything that depends on it, as long as the signature (name/args/return type)
-- doesn't change — which it doesn't here.
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
  array[]::text[],
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
