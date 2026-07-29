-- Life Tracker starter schema
-- Run this once in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists financial_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'My plan',
  annual_salary numeric(12,2),
  monthly_take_home numeric(12,2),
  monthly_dividends numeric(12,2) not null default 0,
  pension_percent numeric(5,2),
  student_loan_plan text,
  monthly_mortgage numeric(12,2) not null default 0,
  monthly_savings_target numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists income_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  gross_amount numeric(12,2) not null default 0,
  net_amount numeric(12,2),
  frequency text not null check (frequency in ('monthly', 'annual', 'weekly')),
  entry_date date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists spending_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  monthly_budget numeric(12,2) not null default 0,
  type text not null check (type in ('fixed', 'variable', 'saving', 'debt')),
  created_at timestamptz not null default now()
);

create table if not exists spending_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid references spending_categories(id) on delete set null,
  label text not null,
  amount numeric(12,2) not null default 0,
  spent_at date not null default current_date,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists mortgage_scenarios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  balance numeric(12,2) not null default 0,
  interest_rate numeric(6,3) not null default 0,
  term_years integer not null default 25,
  monthly_overpayment numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  value numeric(12,2) not null default 0,
  type text not null default 'other',
  created_at timestamptz not null default now()
);

create table if not exists liabilities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  balance numeric(12,2) not null default 0,
  type text not null default 'other',
  created_at timestamptz not null default now()
);

-- Enable Row Level Security.
alter table financial_profiles enable row level security;
alter table income_entries enable row level security;
alter table spending_categories enable row level security;
alter table spending_entries enable row level security;
alter table mortgage_scenarios enable row level security;
alter table assets enable row level security;
alter table liabilities enable row level security;

-- Financial profile policies.
drop policy if exists "financial_profiles_select_own" on financial_profiles;
create policy "financial_profiles_select_own" on financial_profiles
for select using ((select auth.uid()) = user_id);

drop policy if exists "financial_profiles_insert_own" on financial_profiles;
create policy "financial_profiles_insert_own" on financial_profiles
for insert with check ((select auth.uid()) = user_id);

drop policy if exists "financial_profiles_update_own" on financial_profiles;
create policy "financial_profiles_update_own" on financial_profiles
for update using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "financial_profiles_delete_own" on financial_profiles;
create policy "financial_profiles_delete_own" on financial_profiles
for delete using ((select auth.uid()) = user_id);

-- Reusable own-row policies per table.
drop policy if exists "income_entries_select_own" on income_entries;
create policy "income_entries_select_own" on income_entries
for select using ((select auth.uid()) = user_id);

drop policy if exists "income_entries_insert_own" on income_entries;
create policy "income_entries_insert_own" on income_entries
for insert with check ((select auth.uid()) = user_id);

drop policy if exists "income_entries_update_own" on income_entries;
create policy "income_entries_update_own" on income_entries
for update using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "income_entries_delete_own" on income_entries;
create policy "income_entries_delete_own" on income_entries
for delete using ((select auth.uid()) = user_id);

drop policy if exists "spending_categories_select_own" on spending_categories;
create policy "spending_categories_select_own" on spending_categories
for select using ((select auth.uid()) = user_id);

drop policy if exists "spending_categories_insert_own" on spending_categories;
create policy "spending_categories_insert_own" on spending_categories
for insert with check ((select auth.uid()) = user_id);

drop policy if exists "spending_categories_update_own" on spending_categories;
create policy "spending_categories_update_own" on spending_categories
for update using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "spending_categories_delete_own" on spending_categories;
create policy "spending_categories_delete_own" on spending_categories
for delete using ((select auth.uid()) = user_id);

drop policy if exists "spending_entries_select_own" on spending_entries;
create policy "spending_entries_select_own" on spending_entries
for select using ((select auth.uid()) = user_id);

drop policy if exists "spending_entries_insert_own" on spending_entries;
create policy "spending_entries_insert_own" on spending_entries
for insert with check ((select auth.uid()) = user_id);

drop policy if exists "spending_entries_update_own" on spending_entries;
create policy "spending_entries_update_own" on spending_entries
for update using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "spending_entries_delete_own" on spending_entries;
create policy "spending_entries_delete_own" on spending_entries
for delete using ((select auth.uid()) = user_id);

drop policy if exists "mortgage_scenarios_select_own" on mortgage_scenarios;
create policy "mortgage_scenarios_select_own" on mortgage_scenarios
for select using ((select auth.uid()) = user_id);

drop policy if exists "mortgage_scenarios_insert_own" on mortgage_scenarios;
create policy "mortgage_scenarios_insert_own" on mortgage_scenarios
for insert with check ((select auth.uid()) = user_id);

drop policy if exists "mortgage_scenarios_update_own" on mortgage_scenarios;
create policy "mortgage_scenarios_update_own" on mortgage_scenarios
for update using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "mortgage_scenarios_delete_own" on mortgage_scenarios;
create policy "mortgage_scenarios_delete_own" on mortgage_scenarios
for delete using ((select auth.uid()) = user_id);

drop policy if exists "assets_select_own" on assets;
create policy "assets_select_own" on assets
for select using ((select auth.uid()) = user_id);

drop policy if exists "assets_insert_own" on assets;
create policy "assets_insert_own" on assets
for insert with check ((select auth.uid()) = user_id);

drop policy if exists "assets_update_own" on assets;
create policy "assets_update_own" on assets
for update using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "assets_delete_own" on assets;
create policy "assets_delete_own" on assets
for delete using ((select auth.uid()) = user_id);

drop policy if exists "liabilities_select_own" on liabilities;
create policy "liabilities_select_own" on liabilities
for select using ((select auth.uid()) = user_id);

drop policy if exists "liabilities_insert_own" on liabilities;
create policy "liabilities_insert_own" on liabilities
for insert with check ((select auth.uid()) = user_id);

drop policy if exists "liabilities_update_own" on liabilities;
create policy "liabilities_update_own" on liabilities
for update using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "liabilities_delete_own" on liabilities;
create policy "liabilities_delete_own" on liabilities
for delete using ((select auth.uid()) = user_id);

-- Helpful indexes.
create index if not exists financial_profiles_user_id_idx on financial_profiles(user_id);
create index if not exists income_entries_user_id_idx on income_entries(user_id);
create index if not exists spending_categories_user_id_idx on spending_categories(user_id);
create index if not exists spending_entries_user_id_idx on spending_entries(user_id);
create index if not exists mortgage_scenarios_user_id_idx on mortgage_scenarios(user_id);
create index if not exists assets_user_id_idx on assets(user_id);
create index if not exists liabilities_user_id_idx on liabilities(user_id);
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
-- Life Tracker V4 migration
-- Run this after V3. It fixes schema-cache issues and adds:
-- pay event types, simple/advanced childcare modelling, activities and bank-holiday-aware monthly forecasts.

alter table pay_events add column if not exists pay_kind text not null default 'salary';

-- V3 compatibility: add the richer nursery columns too, so this file can be run even if V3 was missed.
alter table child_costs add column if not exists cost_kind text not null default 'fixed';
alter table child_costs add column if not exists billing_month date;
alter table child_costs add column if not exists daily_rate numeric(12,2) not null default 0;
alter table child_costs add column if not exists extra_daily_cost numeric(12,2) not null default 0;
alter table child_costs add column if not exists funded_hours_per_week numeric(8,2) not null default 0;
alter table child_costs add column if not exists funding_mode text not null default 'none';
alter table child_costs add column if not exists hourly_funding_credit numeric(12,2) not null default 0;
alter table child_costs add column if not exists term_weeks_per_year numeric(8,2) not null default 38;
alter table child_costs add column if not exists monday_hours numeric(8,2) not null default 0;
alter table child_costs add column if not exists tuesday_hours numeric(8,2) not null default 0;
alter table child_costs add column if not exists wednesday_hours numeric(8,2) not null default 0;
alter table child_costs add column if not exists thursday_hours numeric(8,2) not null default 0;
alter table child_costs add column if not exists friday_hours numeric(8,2) not null default 0;


do $$
begin
  if exists (select 1 from pg_constraint where conname = 'pay_events_pay_kind_check') then
    alter table pay_events drop constraint pay_events_pay_kind_check;
  end if;

  alter table pay_events add constraint pay_events_pay_kind_check
  check (pay_kind in ('salary', 'maternity', 'return_to_work', 'other'));
end $$;

alter table child_costs add column if not exists billing_schedule text not null default 'all_year';
alter table child_costs add column if not exists bank_holidays_are_free boolean not null default true;
alter table child_costs add column if not exists part_day_multiplier numeric(5,2) not null default 0.5;
alter table child_costs add column if not exists full_day_hours numeric(8,2) not null default 10;
alter table child_costs add column if not exists part_day_hours numeric(8,2) not null default 5;
alter table child_costs add column if not exists monday_session text not null default 'off';
alter table child_costs add column if not exists tuesday_session text not null default 'off';
alter table child_costs add column if not exists wednesday_session text not null default 'off';
alter table child_costs add column if not exists thursday_session text not null default 'off';
alter table child_costs add column if not exists friday_session text not null default 'off';
alter table child_costs add column if not exists activity_weekly_cost numeric(12,2) not null default 0;
alter table child_costs add column if not exists activity_weekday integer not null default 6;
alter table child_costs add column if not exists activity_billing_mode text not null default 'calendar';
alter table child_costs add column if not exists activity_term_weeks_per_year numeric(8,2) not null default 38;

-- Replace old V3 cost-kind constraint so activities can be stored.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'child_costs_cost_kind_check') then
    alter table child_costs drop constraint child_costs_cost_kind_check;
  end if;

  alter table child_costs add constraint child_costs_cost_kind_check
  check (cost_kind in ('fixed', 'nursery', 'activity'));

  if exists (select 1 from pg_constraint where conname = 'child_costs_billing_schedule_check') then
    alter table child_costs drop constraint child_costs_billing_schedule_check;
  end if;

  alter table child_costs add constraint child_costs_billing_schedule_check
  check (billing_schedule in ('all_year', 'term_time'));

  if exists (select 1 from pg_constraint where conname = 'child_costs_day_session_check') then
    alter table child_costs drop constraint child_costs_day_session_check;
  end if;

  alter table child_costs add constraint child_costs_day_session_check
  check (
    monday_session in ('off', 'full', 'part') and
    tuesday_session in ('off', 'full', 'part') and
    wednesday_session in ('off', 'full', 'part') and
    thursday_session in ('off', 'full', 'part') and
    friday_session in ('off', 'full', 'part')
  );

  if exists (select 1 from pg_constraint where conname = 'child_costs_activity_billing_mode_check') then
    alter table child_costs drop constraint child_costs_activity_billing_mode_check;
  end if;

  alter table child_costs add constraint child_costs_activity_billing_mode_check
  check (activity_billing_mode in ('calendar', 'averaged_term'));
end $$;

create index if not exists pay_events_person_month_idx on pay_events(person_id, effective_from, effective_until);
create index if not exists child_costs_child_month_idx on child_costs(child_id, starts_on, ends_on);

-- Tell Supabase/PostgREST to refresh its schema cache immediately.
select pg_notify('pgrst', 'reload schema');
-- Life Tracker V5 migration
-- Adds NHS maternity modelling fields, an integration-secret store for local/dev API tokens,
-- and a schema-cache refresh for Supabase/PostgREST.

alter table pay_events add column if not exists maternity_scheme text;
alter table pay_events add column if not exists maternity_leave_start date;
alter table pay_events add column if not exists maternity_leave_end date;
alter table pay_events add column if not exists maternity_pay_mode text;
alter table pay_events add column if not exists maternity_full_pay_weeks numeric(8,2);
alter table pay_events add column if not exists maternity_half_pay_weeks numeric(8,2);
alter table pay_events add column if not exists maternity_smp_only_weeks numeric(8,2);
alter table pay_events add column if not exists maternity_unpaid_weeks numeric(8,2);
alter table pay_events add column if not exists maternity_smp_weekly_rate numeric(12,2);

-- Make sure maternity remains an accepted pay kind.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'pay_events_pay_kind_check') then
    alter table pay_events drop constraint pay_events_pay_kind_check;
  end if;

  alter table pay_events add constraint pay_events_pay_kind_check
  check (pay_kind in ('salary', 'maternity', 'return_to_work', 'other'));

  if exists (select 1 from pg_constraint where conname = 'pay_events_maternity_pay_mode_check') then
    alter table pay_events drop constraint pay_events_maternity_pay_mode_check;
  end if;

  alter table pay_events add constraint pay_events_maternity_pay_mode_check
  check (maternity_pay_mode is null or maternity_pay_mode in ('spread_equal', 'actual_by_week'));
end $$;

create table if not exists integration_secrets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  key_label text not null,
  -- Deprecated legacy column. Kept nullable so older databases can migrate cleanly.
  secret_value text,
  -- Encrypted secret fields. API tokens must be encrypted because the app needs to use them later;
  -- hashing alone is only useful for fingerprinting/duplicate checks.
  secret_ciphertext text,
  secret_iv text,
  secret_auth_tag text,
  secret_hash text,
  secret_hint text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table integration_secrets enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'integration_secrets' and policyname = 'Users can read their own integration secrets metadata') then
    create policy "Users can read their own integration secrets metadata"
    on integration_secrets
    for select
    using (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where tablename = 'integration_secrets' and policyname = 'Users can insert their own integration secrets') then
    create policy "Users can insert their own integration secrets"
    on integration_secrets
    for insert
    with check (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where tablename = 'integration_secrets' and policyname = 'Users can update their own integration secrets') then
    create policy "Users can update their own integration secrets"
    on integration_secrets
    for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where tablename = 'integration_secrets' and policyname = 'Users can delete their own integration secrets') then
    create policy "Users can delete their own integration secrets"
    on integration_secrets
    for delete
    using (auth.uid() = user_id);
  end if;
end $$;

create index if not exists pay_events_maternity_dates_idx on pay_events(person_id, maternity_leave_start, maternity_leave_end);
alter table integration_secrets alter column secret_value drop not null;
alter table integration_secrets add column if not exists secret_ciphertext text;
alter table integration_secrets add column if not exists secret_iv text;
alter table integration_secrets add column if not exists secret_auth_tag text;
alter table integration_secrets add column if not exists secret_hash text;
alter table integration_secrets add column if not exists secret_hint text;
create index if not exists integration_secrets_user_provider_idx on integration_secrets(user_id, provider);

select pg_notify('pgrst', 'reload schema');
-- Life Tracker V7 migration
-- Adds pension-method modelling, homes/ownership/mortgage-rate tracking,
-- and integration categories for GPT-assisted rate/statutory checks.

alter table pay_events add column if not exists pension_method text not null default 'net_pay';

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'pay_events_pension_method_check') then
    alter table pay_events drop constraint pay_events_pension_method_check;
  end if;

  alter table pay_events add constraint pay_events_pension_method_check
  check (pension_method in ('none', 'net_pay', 'salary_sacrifice', 'relief_at_source', 'nhs_pension'));
end $$;

-- New homes model. This keeps the old standalone mortgage_scenarios intact.
create table if not exists homes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  address_line text,
  postcode text,
  ownership_status text not null default 'current_home',
  property_value numeric(14,2) not null default 0,
  purchase_price numeric(14,2),
  purchase_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists home_owners (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  home_id uuid not null references homes(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  ownership_percent numeric(6,3) not null default 100,
  created_at timestamptz not null default now(),
  unique(home_id, person_id)
);

create table if not exists home_mortgage_deals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  home_id uuid references homes(id) on delete cascade,
  lender text,
  product_name text,
  balance numeric(14,2) not null default 0,
  balance_as_of_date date,
  interest_rate numeric(6,3) not null default 0,
  rate_type text not null default 'fixed',
  repayment_type text not null default 'repayment' check (repayment_type in ('repayment', 'interest_only')),
  initial_period_end date,
  term_years integer not null default 25,
  monthly_payment_override numeric(12,2),
  start_date date not null default current_date,
  end_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Store official-rate assumptions so calculators can be audited.
create table if not exists statutory_rate_assumptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  rate_key text not null,
  label text not null,
  value_numeric numeric(14,4),
  value_text text,
  source_url text,
  source_name text,
  effective_from date,
  effective_until date,
  checked_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table homes enable row level security;
alter table home_owners enable row level security;
alter table home_mortgage_deals enable row level security;
alter table statutory_rate_assumptions enable row level security;

do $$
declare
  tbl text;
begin
  foreach tbl in array array['homes', 'home_owners', 'home_mortgage_deals', 'statutory_rate_assumptions']
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

-- Widen integration connection categories.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'integration_connections_connection_type_check') then
    alter table integration_connections drop constraint integration_connections_connection_type_check;
  end if;

  alter table integration_connections add constraint integration_connections_connection_type_check
  check (connection_type in ('banking', 'open_banking', 'investment', 'open_finance', 'property', 'mortgage_rates', 'statutory_rates', 'tax_rates', 'ai_research', 'other'));
end $$;

create index if not exists pay_events_user_person_dates_idx on pay_events(user_id, person_id, effective_from, effective_until);
create index if not exists homes_user_id_idx on homes(user_id);
create index if not exists home_owners_user_home_idx on home_owners(user_id, home_id);
create index if not exists home_mortgage_deals_user_home_idx on home_mortgage_deals(user_id, home_id);
create index if not exists statutory_rate_assumptions_user_key_idx on statutory_rate_assumptions(user_id, rate_key, effective_from);

select pg_notify('pgrst', 'reload schema');
-- Life Tracker V8 migration
-- Adds person-linked planned items for the Spending Planner calendar,
-- and lets one-off spending entries be assigned to a household member.

alter table spending_entries add column if not exists person_id uuid references people(id) on delete set null;

create table if not exists planned_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  person_id uuid references people(id) on delete set null,
  category_id uuid references spending_categories(id) on delete set null,
  direction text not null default 'outgoing',
  item_type text not null default 'monthly_cost',
  label text not null,
  amount numeric(12,2) not null default 0,
  recurrence text not null default 'monthly',
  start_date date not null default current_date,
  end_date date,
  day_of_month integer,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table planned_items enable row level security;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'planned_items_direction_check') then
    alter table planned_items drop constraint planned_items_direction_check;
  end if;

  alter table planned_items add constraint planned_items_direction_check
  check (direction in ('income', 'outgoing'));

  if exists (select 1 from pg_constraint where conname = 'planned_items_item_type_check') then
    alter table planned_items drop constraint planned_items_item_type_check;
  end if;

  alter table planned_items add constraint planned_items_item_type_check
  check (item_type in ('monthly_cost', 'subscription', 'bill', 'one_off', 'manual_income', 'transfer'));

  if exists (select 1 from pg_constraint where conname = 'planned_items_recurrence_check') then
    alter table planned_items drop constraint planned_items_recurrence_check;
  end if;

  alter table planned_items add constraint planned_items_recurrence_check
  check (recurrence in ('monthly', 'one_off'));

  if exists (select 1 from pg_constraint where conname = 'planned_items_day_of_month_check') then
    alter table planned_items drop constraint planned_items_day_of_month_check;
  end if;

  alter table planned_items add constraint planned_items_day_of_month_check
  check (day_of_month is null or (day_of_month >= 1 and day_of_month <= 31));
end $$;

drop policy if exists "planned_items_select_own" on planned_items;
create policy "planned_items_select_own" on planned_items
for select using ((select auth.uid()) = user_id);

drop policy if exists "planned_items_insert_own" on planned_items;
create policy "planned_items_insert_own" on planned_items
for insert with check ((select auth.uid()) = user_id);

drop policy if exists "planned_items_update_own" on planned_items;
create policy "planned_items_update_own" on planned_items
for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "planned_items_delete_own" on planned_items;
create policy "planned_items_delete_own" on planned_items
for delete using ((select auth.uid()) = user_id);

create index if not exists spending_entries_user_person_date_idx on spending_entries(user_id, person_id, spent_at);
create index if not exists planned_items_user_person_dates_idx on planned_items(user_id, person_id, start_date, end_date);
create index if not exists planned_items_user_recurrence_idx on planned_items(user_id, recurrence, direction);

select pg_notify('pgrst', 'reload schema');
-- V10: quicker property capture, address lookup/enrichment metadata and valuation averaging controls.

alter table homes add column if not exists house_number text;
alter table homes add column if not exists uprn text;
alter table homes add column if not exists property_type text;
alter table homes add column if not exists lookup_source text default 'manual';
alter table homes add column if not exists purchase_source_url text;
alter table homes add column if not exists last_lookup_at date;

create index if not exists homes_user_postcode_house_idx on homes(user_id, postcode, house_number);
create index if not exists homes_user_lookup_source_idx on homes(user_id, lookup_source);

-- Keep valuation sources flexible while we trial source averaging / confidence weighting.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'home_valuation_sources_source_type_check') then
    alter table home_valuation_sources drop constraint home_valuation_sources_source_type_check;
  end if;

  alter table home_valuation_sources add constraint home_valuation_sources_source_type_check
  check (source_type in ('user_estimate', 'estate_agent', 'survey', 'zoopla', 'rightmove', 'land_registry', 'propertydata', 'avm', 'lender', 'postcode_lookup', 'openai_research', 'other'));
end $$;

-- Allow specific property/address integrations to be tracked in Integrations later.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'integration_connections_connection_type_check') then
    alter table integration_connections drop constraint integration_connections_connection_type_check;
  end if;

  alter table integration_connections add constraint integration_connections_connection_type_check
  check (connection_type in ('banking', 'open_banking', 'investment', 'open_finance', 'property', 'property_valuation', 'address_lookup', 'geocoding', 'maps', 'mortgage_rates', 'statutory_rates', 'tax_rates', 'ai_research', 'other'));
end $$;

select pg_notify('pgrst', 'reload schema');


-- V13: Banking CSV import and regular-payment detection.
-- Imports bank CSV transactions, stores them privately, and suggests recurring payments
-- that can be accepted into the Spending Planner as normal monthly items.

create table if not exists bank_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  person_id uuid references people(id) on delete set null,
  account_name text not null default 'Bank account',
  provider_name text,
  original_filename text,
  imported_rows integer not null default 0,
  detected_rows integer not null default 0,
  status text not null default 'processed',
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists bank_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  import_id uuid references bank_imports(id) on delete cascade,
  person_id uuid references people(id) on delete set null,
  account_name text not null default 'Bank account',
  transaction_date date not null,
  description text not null,
  normalized_description text not null,
  amount numeric(12,2) not null,
  direction text not null check (direction in ('income', 'outgoing')),
  source_row_index integer,
  raw_data jsonb,
  created_at timestamptz not null default now()
);

create table if not exists bank_regular_payment_candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  person_id uuid references people(id) on delete set null,
  account_name text,
  normalized_key text not null,
  direction text not null check (direction in ('income', 'outgoing')),
  label_suggestion text not null,
  amount_average numeric(12,2) not null default 0,
  amount_min numeric(12,2) not null default 0,
  amount_max numeric(12,2) not null default 0,
  day_of_month integer,
  first_seen date,
  last_seen date,
  occurrence_count integer not null default 0,
  seen_month_count integer not null default 0,
  confidence numeric(5,2) not null default 0,
  sample_descriptions jsonb not null default '[]'::jsonb,
  sample_dates jsonb not null default '[]'::jsonb,
  notes text,
  status text not null default 'suggested' check (status in ('suggested', 'accepted', 'dismissed')),
  planned_item_id uuid references planned_items(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table bank_imports enable row level security;
alter table bank_transactions enable row level security;
alter table bank_regular_payment_candidates enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['bank_imports', 'bank_transactions', 'bank_regular_payment_candidates']
  loop
    if not exists (select 1 from pg_policies where tablename = t and policyname = 'Users can read their own rows') then
      execute format('create policy "Users can read their own rows" on %I for select using ((select auth.uid()) = user_id)', t);
    end if;
    if not exists (select 1 from pg_policies where tablename = t and policyname = 'Users can insert their own rows') then
      execute format('create policy "Users can insert their own rows" on %I for insert with check ((select auth.uid()) = user_id)', t);
    end if;
    if not exists (select 1 from pg_policies where tablename = t and policyname = 'Users can update their own rows') then
      execute format('create policy "Users can update their own rows" on %I for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    end if;
    if not exists (select 1 from pg_policies where tablename = t and policyname = 'Users can delete their own rows') then
      execute format('create policy "Users can delete their own rows" on %I for delete using ((select auth.uid()) = user_id)', t);
    end if;
  end loop;
end $$;

create index if not exists bank_imports_user_id_idx on bank_imports(user_id);
create index if not exists bank_transactions_user_date_idx on bank_transactions(user_id, transaction_date desc);
create index if not exists bank_transactions_user_normalized_idx on bank_transactions(user_id, normalized_description, direction);
create index if not exists bank_regular_payment_candidates_user_status_idx on bank_regular_payment_candidates(user_id, status, confidence desc);
create index if not exists bank_regular_payment_candidates_user_key_idx on bank_regular_payment_candidates(user_id, normalized_key, direction);

notify pgrst, 'reload schema';
-- V14: polish mortgage/affordability/net-worth/income UX and add Tax-Free Childcare support.
-- Safe to run after any previous V build.

-- Childcare: Tax-Free Childcare planning fields.
alter table child_costs add column if not exists tax_free_childcare_enabled boolean not null default false;
alter table child_costs add column if not exists tax_free_childcare_cap_per_quarter numeric(12,2) not null default 500;

-- Income/net-worth ownership assignments.
alter table income_entries add column if not exists person_id uuid references people(id) on delete set null;
alter table assets add column if not exists person_id uuid references people(id) on delete set null;
alter table assets add column if not exists source_type text not null default 'manual';
alter table liabilities add column if not exists person_id uuid references people(id) on delete set null;
alter table liabilities add column if not exists source_type text not null default 'manual';

-- Affordability saved-search enrichments.
alter table affordability_scenarios add column if not exists target_property_url text;
alter table affordability_scenarios add column if not exists selected_rate_label text;
alter table affordability_scenarios add column if not exists selected_lender text;
alter table affordability_scenarios add column if not exists selected_rate_type text;
alter table affordability_scenarios add column if not exists affordability_score text;
alter table affordability_scenarios add column if not exists monthly_buffer numeric(14,2);

create index if not exists income_entries_user_person_idx on income_entries(user_id, person_id, entry_date);
create index if not exists assets_user_person_idx on assets(user_id, person_id, type);
create index if not exists liabilities_user_person_idx on liabilities(user_id, person_id, type);

notify pgrst, 'reload schema';
-- Life Tracker V17: pension funds + investment holdings
-- Run after previous migrations. Safe to run multiple times.

create extension if not exists pgcrypto;

create table if not exists pension_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  person_id uuid references people(id) on delete set null,
  label text not null,
  provider text not null,
  pension_type text not null default 'work' check (pension_type in ('work', 'private')),
  contribution_method text not null default 'salary_sacrifice' check (contribution_method in ('salary_sacrifice', 'net_pay', 'relief_at_source', 'none')),
  employee_contribution_percent numeric(7,3) not null default 0,
  employer_contribution_percent numeric(7,3) not null default 0,
  employer_ni_topup_percent numeric(7,3) not null default 0,
  fixed_monthly_contribution numeric(12,2) not null default 0,
  annual_platform_fee_percent numeric(7,4) not null default 0,
  fixed_monthly_fee numeric(12,2) not null default 0,
  current_value numeric(14,2) not null default 0,
  value_as_of_date date not null default current_date,
  source_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists pension_funds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pension_account_id uuid not null references pension_accounts(id) on delete cascade,
  fund_name text not null,
  fund_code text,
  group_label text,
  target_allocation_percent numeric(7,3) not null default 0,
  monthly_contribution_percent numeric(7,3) not null default 0,
  contribution_active boolean not null default true,
  current_value numeric(14,2) not null default 0,
  units numeric(16,6),
  unit_price numeric(14,6),
  annual_fund_fee_percent numeric(7,4) not null default 0,
  price_as_of_date date not null default current_date,
  fee_source_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists investment_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  person_id uuid references people(id) on delete set null,
  label text not null,
  provider text not null,
  account_type text not null default 'gia' check (account_type in ('gia', 'isa', 'sipp', 'crypto', 'other')),
  annual_platform_fee_percent numeric(7,4) not null default 0,
  fixed_monthly_fee numeric(12,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists investment_holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  investment_account_id uuid not null references investment_accounts(id) on delete cascade,
  asset_name text not null,
  ticker text,
  exchange text,
  group_label text,
  units numeric(16,6) not null default 0,
  average_buy_price numeric(14,6) not null default 0,
  latest_price numeric(14,6) not null default 0,
  latest_price_date date not null default current_date,
  currency text not null default 'GBP',
  annual_asset_fee_percent numeric(7,4) not null default 0,
  target_allocation_percent numeric(7,3) not null default 0,
  source_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists investment_price_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  holding_id uuid not null references investment_holdings(id) on delete cascade,
  price numeric(14,6) not null default 0,
  units numeric(16,6) not null default 0,
  value numeric(14,2) not null default 0,
  snapshot_date date not null default current_date,
  source text,
  created_at timestamptz not null default now(),
  unique(user_id, holding_id, snapshot_date)
);

alter table pension_accounts enable row level security;
alter table pension_funds enable row level security;
alter table investment_accounts enable row level security;
alter table investment_holdings enable row level security;
alter table investment_price_snapshots enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['pension_accounts','pension_funds','investment_accounts','investment_holdings','investment_price_snapshots'] loop
    execute format('drop policy if exists %I on %I', t || '_select_own', t);
    execute format('create policy %I on %I for select using ((select auth.uid()) = user_id)', t || '_select_own', t);
    execute format('drop policy if exists %I on %I', t || '_insert_own', t);
    execute format('create policy %I on %I for insert with check ((select auth.uid()) = user_id)', t || '_insert_own', t);
    execute format('drop policy if exists %I on %I', t || '_update_own', t);
    execute format('create policy %I on %I for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t || '_update_own', t);
    execute format('drop policy if exists %I on %I', t || '_delete_own', t);
    execute format('create policy %I on %I for delete using ((select auth.uid()) = user_id)', t || '_delete_own', t);
  end loop;
end $$;

create index if not exists pension_accounts_user_idx on pension_accounts(user_id);
create index if not exists pension_accounts_person_idx on pension_accounts(person_id);
create index if not exists pension_funds_user_account_idx on pension_funds(user_id, pension_account_id);
create index if not exists investment_accounts_user_idx on investment_accounts(user_id);
create index if not exists investment_accounts_person_idx on investment_accounts(person_id);
create index if not exists investment_holdings_user_account_idx on investment_holdings(user_id, investment_account_id);
create index if not exists investment_price_snapshots_user_holding_date_idx on investment_price_snapshots(user_id, holding_id, snapshot_date desc);

notify pgrst, 'reload schema';
