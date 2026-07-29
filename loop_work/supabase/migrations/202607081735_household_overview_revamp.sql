-- v28.76 Household overview revamp foundations

create table if not exists public.household_overview_snapshots (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.app_households(id) on delete cascade,
  user_id uuid null references auth.users(id) on delete set null,
  month_key text not null,
  monthly_income numeric(14,2) not null default 0,
  monthly_outgoings numeric(14,2) not null default 0,
  savings_and_investments numeric(14,2) not null default 0,
  average_cost_per_head numeric(14,2) not null default 0,
  savings_rate_percent numeric(8,2) not null default 0,
  cost_to_income_percent numeric(8,2) not null default 0,
  optimisation_score integer not null default 0,
  annual_carbon_kg_estimate numeric(14,2) not null default 0,
  carbon_confidence text not null default 'low' check (carbon_confidence in ('low','medium','high')),
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(household_id, month_key)
);

create table if not exists public.household_carbon_profiles (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.app_households(id) on delete cascade,
  user_id uuid null references auth.users(id) on delete set null,
  source text not null default 'spending_heuristic',
  annual_kg_co2e numeric(14,2) null,
  confidence text not null default 'low' check (confidence in ('low','medium','high')),
  provider_reference text null,
  connected_provider text null,
  notes text null,
  last_checked_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists household_overview_snapshots_household_month_idx on public.household_overview_snapshots(household_id, month_key desc);
create index if not exists household_carbon_profiles_household_idx on public.household_carbon_profiles(household_id, source);

comment on table public.household_overview_snapshots is 'Monthly household cockpit snapshots for income, outgoings, savings rate, optimisation and carbon estimate evidence.';
comment on table public.household_carbon_profiles is 'Optional household carbon/footprint source data. Initial UI uses spending heuristics; provider/questionnaire hooks can write here later.';
