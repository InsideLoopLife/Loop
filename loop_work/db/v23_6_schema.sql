-- V23.6 - pension/investment hardening: DB pension logs, fund snapshots, PDF-friendly import support metadata.

create table if not exists defined_benefit_pensions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  person_id uuid references people(id) on delete set null,
  scheme_name text not null default 'Defined benefit pension',
  provider text not null default 'Provider',
  scheme_section text not null default '2015 CARE',
  accrual_rate numeric(10,4) not null default 54,
  revaluation_rate_percent numeric(10,4) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists db_pension_service_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  db_pension_id uuid not null references defined_benefit_pensions(id) on delete cascade,
  band_label text not null,
  pensionable_pay numeric(12,2) not null default 0,
  contribution_percent numeric(10,4) not null default 0,
  employer_contribution_percent numeric(10,4) not null default 0,
  start_date date not null,
  end_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists pension_fund_value_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pension_fund_id uuid not null references pension_funds(id) on delete cascade,
  snapshot_date date not null,
  units numeric(20,8),
  unit_price numeric(18,8),
  value numeric(14,2),
  monthly_contribution_applied numeric(14,2) not null default 0,
  source text not null default 'manual_projection',
  created_at timestamptz not null default now(),
  unique(user_id, pension_fund_id, snapshot_date)
);

create table if not exists pension_contribution_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pension_account_id uuid references pension_accounts(id) on delete cascade,
  pension_fund_id uuid references pension_funds(id) on delete cascade,
  label text not null default 'Contribution rule',
  employee_contribution_percent numeric(10,4),
  employer_contribution_percent numeric(10,4),
  employer_ni_topup_percent numeric(10,4),
  fund_allocation_percent numeric(10,4),
  fixed_monthly_contribution numeric(12,2),
  effective_from date not null default current_date,
  effective_until date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table defined_benefit_pensions enable row level security;
alter table db_pension_service_events enable row level security;
alter table pension_fund_value_snapshots enable row level security;
alter table pension_contribution_rules enable row level security;

do $$ begin
  create policy "defined_benefit_pensions_select_own" on defined_benefit_pensions for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "defined_benefit_pensions_insert_own" on defined_benefit_pensions for insert with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "defined_benefit_pensions_update_own" on defined_benefit_pensions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "defined_benefit_pensions_delete_own" on defined_benefit_pensions for delete using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "db_pension_service_events_select_own" on db_pension_service_events for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "db_pension_service_events_insert_own" on db_pension_service_events for insert with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "db_pension_service_events_update_own" on db_pension_service_events for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "db_pension_service_events_delete_own" on db_pension_service_events for delete using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "pension_fund_value_snapshots_select_own" on pension_fund_value_snapshots for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "pension_fund_value_snapshots_insert_own" on pension_fund_value_snapshots for insert with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "pension_fund_value_snapshots_update_own" on pension_fund_value_snapshots for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "pension_fund_value_snapshots_delete_own" on pension_fund_value_snapshots for delete using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "pension_contribution_rules_select_own" on pension_contribution_rules for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "pension_contribution_rules_insert_own" on pension_contribution_rules for insert with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "pension_contribution_rules_update_own" on pension_contribution_rules for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "pension_contribution_rules_delete_own" on pension_contribution_rules for delete using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

create index if not exists idx_defined_benefit_pensions_user on defined_benefit_pensions(user_id);
create index if not exists idx_db_pension_service_events_user_scheme on db_pension_service_events(user_id, db_pension_id);
create index if not exists idx_pension_fund_value_snapshots_user_date on pension_fund_value_snapshots(user_id, snapshot_date);
create index if not exists idx_pension_contribution_rules_user_dates on pension_contribution_rules(user_id, effective_from, effective_until);

notify pgrst, 'reload schema';
