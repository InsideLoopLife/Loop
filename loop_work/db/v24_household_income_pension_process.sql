-- V24: person/household visibility scaffold, income timing, pension contribution snapshots.

-- Core person ownership / visibility scaffold for future account-per-person model.
alter table if exists people add column if not exists owner_user_id uuid;
alter table if exists people add column if not exists household_visibility text not null default 'household_summary';
alter table if exists people add column if not exists income_visibility text not null default 'household_summary';
alter table if exists people add column if not exists cost_visibility text not null default 'household_editable';
alter table if exists people add column if not exists maturity_date date;
alter table if exists people add column if not exists matured_account_user_id uuid;

update people set owner_user_id = user_id where owner_user_id is null;

create table if not exists household_join_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid,
  code_hash text not null,
  role text not null default 'member',
  status text not null default 'active',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique(user_id, code_hash)
);

alter table household_join_codes enable row level security;

do $$ begin
  create policy "Users manage their own household join codes" on household_join_codes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

create table if not exists household_person_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  person_id uuid references people(id) on delete cascade,
  viewer_user_id uuid references auth.users(id) on delete cascade,
  can_view_income boolean not null default false,
  can_view_costs boolean not null default true,
  can_add_costs boolean not null default true,
  can_manage_profile boolean not null default false,
  starts_on date not null default current_date,
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(person_id, viewer_user_id)
);

alter table household_person_permissions enable row level security;

do $$ begin
  create policy "Users manage their person sharing permissions" on household_person_permissions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

-- Income entries also need payment timing when they are used directly, not only via pay_events.
alter table if exists income_entries add column if not exists payment_timing text default 'last_workday';
alter table if exists income_entries add column if not exists pay_day_of_month integer;
alter table if exists income_entries add column if not exists payment_adjustment text default 'previous_workday';
alter table if exists income_entries add column if not exists archived_at timestamptz;
alter table if exists income_entries add column if not exists notes text;

-- Make pension projections traceable and idempotent per fund/month.
create table if not exists pension_contribution_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pension_fund_id uuid references pension_funds(id) on delete cascade,
  contribution_month text not null,
  contribution_date date not null default current_date,
  contribution_amount numeric(12,2) not null default 0,
  unit_price numeric(18,6),
  units_bought numeric(20,8),
  source text not null default 'manual',
  notes text,
  created_at timestamptz not null default now(),
  unique(user_id, pension_fund_id, contribution_month)
);

alter table pension_contribution_events enable row level security;

do $$ begin
  create policy "Users read their pension contribution events" on pension_contribution_events for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

create index if not exists pension_contribution_events_fund_month_idx on pension_contribution_events(pension_fund_id, contribution_month desc);

-- Support regular provider review process for price/fee values.
alter table if exists provider_fund_glossary add column if not exists next_fee_check_at timestamptz;
alter table if exists provider_fund_glossary add column if not exists next_price_check_at timestamptz;
alter table if exists provider_fund_glossary add column if not exists last_fee_changed_at timestamptz;
alter table if exists provider_fund_glossary add column if not exists last_price_changed_at timestamptz;
alter table if exists provider_fund_glossary add column if not exists review_status text not null default 'source_backed_assumption';

notify pgrst, 'reload schema';
