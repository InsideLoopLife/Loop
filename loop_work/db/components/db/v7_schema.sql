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
  interest_rate numeric(6,3) not null default 0,
  rate_type text not null default 'fixed',
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
