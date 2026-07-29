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
