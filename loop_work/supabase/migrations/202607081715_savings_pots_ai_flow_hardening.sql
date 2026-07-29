-- v28.75 Savings pots, AI evidence and flow source hardening

create table if not exists public.savings_pots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid null,
  person_id uuid null references public.people(id) on delete set null,
  name text not null,
  target_amount numeric(14,2) null,
  target_date date null,
  monthly_target numeric(14,2) null,
  current_allocated_amount numeric(14,2) not null default 0,
  priority integer not null default 50,
  colour text null,
  icon text null,
  status text not null default 'active' check (status in ('active','paused','completed','archived')),
  visibility_scope text not null default 'household' check (visibility_scope in ('private','household')),
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.savings_pot_allocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid null,
  savings_pot_id uuid not null references public.savings_pots(id) on delete cascade,
  financial_account_id uuid null references public.financial_accounts(id) on delete set null,
  allocation_type text not null default 'manual' check (allocation_type in ('manual','account_balance','monthly_topup','movement','projection')),
  amount numeric(14,2) not null default 0,
  allocation_percent numeric(8,4) null,
  effective_from date null,
  effective_to date null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists savings_pots_user_status_idx on public.savings_pots(user_id, status);
create index if not exists savings_pots_household_idx on public.savings_pots(household_id, visibility_scope);
create index if not exists savings_pot_allocations_pot_idx on public.savings_pot_allocations(savings_pot_id);
create index if not exists savings_pot_allocations_account_idx on public.savings_pot_allocations(financial_account_id);

alter table public.savings_account_movements add column if not exists source_note text;
alter table public.savings_account_movements add column if not exists tax_year text;

comment on table public.savings_pots is 'Goal-level savings pots independent of the bank account that physically holds the money.';
comment on table public.savings_pot_allocations is 'Links pots to account balances, monthly top-ups, movements or manual allocations so one pot can span several providers.';
comment on column public.savings_account_movements.tax_year is 'UK tax year label used by savings AI/tax evidence, e.g. 2026/27.';
