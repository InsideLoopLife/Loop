-- LOOP v28.02 - Savings deal watch, mortgage renewal watch and moving-search scenarios
-- Additive migration. Keeps current manual data, avoids forcing live providers, and gives cron/UI safe tables to read/write.

alter table if exists public.financial_accounts
  add column if not exists savings_watch_enabled boolean not null default true,
  add column if not exists savings_surplus_sweep_enabled boolean not null default true,
  add column if not exists savings_minimum_buffer numeric,
  add column if not exists savings_last_recommendation_at timestamptz;

alter table if exists public.home_mortgage_deals
  add column if not exists renewal_watch_enabled boolean not null default true,
  add column if not exists renewal_alert_months integer not null default 9,
  add column if not exists current_lender_watch_enabled boolean not null default true,
  add column if not exists whole_market_watch_enabled boolean not null default true,
  add column if not exists last_rate_watch_at timestamptz;

create table if not exists public.savings_rate_watch_runs (
  id uuid primary key default gen_random_uuid(),
  run_key text not null unique,
  run_kind text not null default 'daily_8am',
  status text not null default 'started',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  accounts_checked integer not null default 0,
  recommendations_created integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  error text
);

create table if not exists public.savings_rate_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  financial_account_id uuid references public.financial_accounts(id) on delete cascade,
  savings_rate_deal_id uuid references public.savings_rate_deals(id) on delete set null,
  provider_slug text,
  provider_name text,
  product_name text,
  recommendation_kind text not null default 'better_rate',
  eligibility_status text not null default 'unknown',
  current_rate numeric,
  suggested_rate numeric,
  rate_delta numeric,
  balance_checked numeric,
  estimated_annual_gain numeric,
  source_url text,
  reason text,
  status text not null default 'new',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  dismissed_at timestamptz,
  constraint savings_rate_recommendations_status_check check (status in ('new','seen','watching','dismissed','applied','expired'))
);

create unique index if not exists savings_rate_recommendations_unique_idx
on public.savings_rate_recommendations(user_id, financial_account_id, savings_rate_deal_id);

create index if not exists savings_rate_recommendations_user_idx
on public.savings_rate_recommendations(user_id, status, created_at desc);

create table if not exists public.mortgage_rate_deals (
  id uuid primary key default gen_random_uuid(),
  lender_slug text,
  lender_name text not null,
  product_name text,
  rate_type text not null default 'fixed',
  initial_term_months integer,
  ltv_max numeric,
  ltv_min numeric,
  rate_percent numeric,
  product_fee numeric,
  existing_customer_only boolean not null default false,
  new_customer_available boolean not null default true,
  source_url text,
  source_name text,
  source_checked_at timestamptz,
  confidence integer not null default 50,
  status text not null default 'needs_review',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mortgage_rate_deals_lookup_idx
on public.mortgage_rate_deals(status, lender_slug, rate_type, ltv_max, rate_percent);

create table if not exists public.mortgage_renewal_watch_runs (
  id uuid primary key default gen_random_uuid(),
  run_key text not null unique,
  run_kind text not null default 'daily_mortgage_watch',
  status text not null default 'started',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  mortgages_checked integer not null default 0,
  recommendations_created integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  error text
);

create table if not exists public.mortgage_renewal_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  home_id uuid references public.homes(id) on delete cascade,
  mortgage_deal_id uuid references public.home_mortgage_deals(id) on delete cascade,
  mortgage_rate_deal_id uuid references public.mortgage_rate_deals(id) on delete set null,
  recommendation_kind text not null default 'whole_market',
  lender_name text,
  product_name text,
  current_lender text,
  current_rate numeric,
  suggested_rate numeric,
  rate_delta numeric,
  estimated_current_payment numeric,
  estimated_new_payment numeric,
  estimated_monthly_saving numeric,
  product_fee numeric,
  ltv numeric,
  months_until_end integer,
  source_url text,
  reason text,
  status text not null default 'new',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  dismissed_at timestamptz,
  constraint mortgage_renewal_recommendations_status_check check (status in ('new','seen','watching','saved','dismissed','expired'))
);

create unique index if not exists mortgage_renewal_recommendations_unique_idx
on public.mortgage_renewal_recommendations(user_id, mortgage_deal_id, mortgage_rate_deal_id, recommendation_kind);

create index if not exists mortgage_renewal_recommendations_user_idx
on public.mortgage_renewal_recommendations(user_id, status, created_at desc);

create table if not exists public.property_move_queries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  home_id uuid references public.homes(id) on delete set null,
  title text not null default 'Move search',
  property_url text,
  asking_price numeric,
  postcode text,
  address_hint text,
  bedrooms integer,
  council_tax_band text,
  council_tax_estimate_annual numeric,
  epc_rating text,
  epc_energy_cost_estimate_annual numeric,
  expected_heating_cost_monthly numeric,
  stamp_duty_estimate numeric,
  moving_cost_estimate numeric,
  target_deposit numeric,
  expected_mortgage_balance numeric,
  expected_rate numeric,
  expected_term_years integer,
  expected_payment numeric,
  affordability_score integer,
  status text not null default 'watching',
  source_status text not null default 'manual',
  notes text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint property_move_queries_status_check check (status in ('watching','saved','dismissed','archived'))
);

create index if not exists property_move_queries_user_idx
on public.property_move_queries(user_id, status, created_at desc);

create table if not exists public.property_move_query_events (
  id uuid primary key default gen_random_uuid(),
  query_id uuid not null references public.property_move_queries(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_kind text not null default 'note',
  title text,
  detail text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists property_move_query_events_query_idx
on public.property_move_query_events(query_id, created_at desc);

alter table public.savings_rate_watch_runs enable row level security;
alter table public.savings_rate_recommendations enable row level security;
alter table public.mortgage_rate_deals enable row level security;
alter table public.mortgage_renewal_watch_runs enable row level security;
alter table public.mortgage_renewal_recommendations enable row level security;
alter table public.property_move_queries enable row level security;
alter table public.property_move_query_events enable row level security;

drop policy if exists "savings recs own" on public.savings_rate_recommendations;
create policy "savings recs own" on public.savings_rate_recommendations
  for select using (auth.uid() = user_id);

drop policy if exists "mortgage recs own" on public.mortgage_renewal_recommendations;
create policy "mortgage recs own" on public.mortgage_renewal_recommendations
  for select using (auth.uid() = user_id);

drop policy if exists "move queries own" on public.property_move_queries;
create policy "move queries own" on public.property_move_queries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "move query events own" on public.property_move_query_events;
create policy "move query events own" on public.property_move_query_events
  for select using (auth.uid() = user_id);

drop policy if exists "mortgage public deals readable" on public.mortgage_rate_deals;
create policy "mortgage public deals readable" on public.mortgage_rate_deals
  for select using (status in ('active','needs_review'));

-- Feature flags for Admin > Tiers. These are not forced on existing custom cells.
insert into public.app_tier_features(feature_key, category, name, description, is_active)
values
  ('savings_rate_watch', 'WEALTH', 'Savings rate watch', 'Daily 8am savings-rate check against user accounts, surplus and eligibility.', true),
  ('mortgage_renewal_watch', 'WEALTH', 'Mortgage renewal watch', 'Daily mortgage renewal/deal-end checks for current lender and whole-market comparisons.', true),
  ('move_planner', 'WEALTH', 'Moving / property search planner', 'Save Rightmove/Zoopla/manual target-house searches and calculate affordability, stamp duty, council tax and energy assumptions.', true)
on conflict (feature_key) do update set
  category = excluded.category,
  name = excluded.name,
  description = excluded.description,
  is_active = true,
  updated_at = now();

insert into public.app_tier_plan_features(plan_slug, feature_key, enabled, limit_value, limit_period, enforcement_mode, health_status, user_message)
select p.slug, feature_key,
       (p.slug in ('plus','pro','realtime','enterprise','admin_override')),
       case when feature_key = 'move_planner' and p.slug = 'plus' then 5 else null end,
       case when feature_key = 'move_planner' and p.slug = 'plus' then 'month' else 'none' end,
       case when p.slug in ('plus','pro','realtime','enterprise','admin_override') then 'audit' else 'upgrade' end,
       'active',
       case when p.slug in ('plus','pro','realtime','enterprise','admin_override') then 'Included for this tier.' else 'Upgrade to use this automation.' end
from public.app_tier_plans p
cross join (values ('savings_rate_watch'),('mortgage_renewal_watch'),('move_planner')) f(feature_key)
on conflict (plan_slug, feature_key) do nothing;
