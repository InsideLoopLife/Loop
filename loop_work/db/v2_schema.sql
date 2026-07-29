-- Life Tracker V2 migration
-- Run this after db/schema.sql if you already set up the first starter app.
-- It adds household planning, account snapshots, integrations and property affordability tables.

create extension if not exists pgcrypto;

create table if not exists people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  relationship text not null check (relationship in ('self', 'partner', 'child', 'other')),
  birth_date date,
  active_from date not null default current_date,
  active_until date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists pay_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  person_id uuid references people(id) on delete cascade,
  label text not null,
  gross_annual_salary numeric(12,2) not null default 0,
  monthly_take_home_override numeric(12,2),
  pension_percent numeric(5,2) not null default 0,
  student_loan_plan text not null default 'none',
  effective_from date not null default current_date,
  effective_until date,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists child_costs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  child_id uuid references people(id) on delete cascade,
  label text not null,
  cost_kind text not null default 'fixed' check (cost_kind in ('fixed', 'nursery')),
  monthly_cost numeric(12,2) not null default 0,
  billing_month date,
  daily_rate numeric(12,2) not null default 0,
  extra_daily_cost numeric(12,2) not null default 0,
  funded_hours_per_week numeric(8,2) not null default 0,
  funding_mode text not null default 'none' check (funding_mode in ('none', 'stretched', 'term_time')),
  hourly_funding_credit numeric(12,2) not null default 0,
  term_weeks_per_year numeric(8,2) not null default 38,
  monday_hours numeric(8,2) not null default 0,
  tuesday_hours numeric(8,2) not null default 0,
  wednesday_hours numeric(8,2) not null default 0,
  thursday_hours numeric(8,2) not null default 0,
  friday_hours numeric(8,2) not null default 0,
  starts_on date not null default current_date,
  ends_on date,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists financial_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  provider text,
  account_type text not null default 'other' check (account_type in ('current_account', 'savings', 'investment', 'pension', 'mortgage', 'property', 'credit_card', 'loan', 'other')),
  current_balance numeric(14,2) not null default 0,
  currency text not null default 'GBP',
  is_liability boolean not null default false,
  manual_update boolean not null default true,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists account_balance_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references financial_accounts(id) on delete cascade,
  snapshot_date date not null default current_date,
  balance numeric(14,2) not null default 0,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  unique (account_id, snapshot_date)
);

create table if not exists integration_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  connection_type text not null check (connection_type in ('banking', 'investment', 'property', 'mortgage_rates', 'other')),
  status text not null default 'planned' check (status in ('planned', 'sandbox', 'connected', 'needs_reauth', 'disabled')),
  consent_expires_at timestamptz,
  last_synced_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists property_watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  postcode text,
  target_price numeric(14,2) not null default 0,
  current_estimated_value numeric(14,2),
  property_type text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists affordability_scenarios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  purchase_price numeric(14,2) not null default 0,
  deposit_cash numeric(14,2) not null default 0,
  current_property_sale_price numeric(14,2) not null default 0,
  current_mortgage_balance numeric(14,2) not null default 0,
  gross_household_income numeric(14,2) not null default 0,
  monthly_fixed_costs numeric(14,2) not null default 0,
  monthly_childcare numeric(14,2) not null default 0,
  interest_rate numeric(6,3) not null default 0,
  stress_rate numeric(6,3) not null default 0,
  term_years integer not null default 25,
  arrangement_and_moving_costs numeric(14,2) not null default 3500,
  is_additional_property boolean not null default false,
  first_time_buyer boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);

alter table people enable row level security;
alter table pay_events enable row level security;
alter table child_costs enable row level security;
alter table financial_accounts enable row level security;
alter table account_balance_snapshots enable row level security;
alter table integration_connections enable row level security;
alter table property_watchlist enable row level security;
alter table affordability_scenarios enable row level security;

-- Own-row policies. Safe to re-run.
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'people',
    'pay_events',
    'child_costs',
    'financial_accounts',
    'account_balance_snapshots',
    'integration_connections',
    'property_watchlist',
    'affordability_scenarios'
  ]
  loop
    execute format('drop policy if exists "%s_select_own" on %I', tbl, tbl);
    execute format('create policy "%s_select_own" on %I for select using ((select auth.uid()) = user_id)', tbl, tbl);

    execute format('drop policy if exists "%s_insert_own" on %I', tbl, tbl);
    execute format('create policy "%s_insert_own" on %I for insert with check ((select auth.uid()) = user_id)', tbl, tbl);

    execute format('drop policy if exists "%s_update_own" on %I', tbl, tbl);
    execute format('create policy "%s_update_own" on %I for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', tbl, tbl);

    execute format('drop policy if exists "%s_delete_own" on %I', tbl, tbl);
    execute format('create policy "%s_delete_own" on %I for delete using ((select auth.uid()) = user_id)', tbl, tbl);
  end loop;
end $$;

create index if not exists people_user_id_idx on people(user_id);
create index if not exists pay_events_user_id_idx on pay_events(user_id);
create index if not exists pay_events_person_id_idx on pay_events(person_id);
create index if not exists child_costs_user_id_idx on child_costs(user_id);
create index if not exists child_costs_child_id_idx on child_costs(child_id);
create index if not exists child_costs_active_dates_idx on child_costs(starts_on, ends_on);
create index if not exists financial_accounts_user_id_idx on financial_accounts(user_id);
create index if not exists account_balance_snapshots_user_id_idx on account_balance_snapshots(user_id);
create index if not exists account_balance_snapshots_account_date_idx on account_balance_snapshots(account_id, snapshot_date);
create index if not exists integration_connections_user_id_idx on integration_connections(user_id);
create index if not exists property_watchlist_user_id_idx on property_watchlist(user_id);
create index if not exists affordability_scenarios_user_id_idx on affordability_scenarios(user_id);
