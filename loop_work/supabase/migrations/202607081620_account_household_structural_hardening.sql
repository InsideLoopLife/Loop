-- v28.74 account / household structural hardening
-- Makes specialist modules opt-in, separates admin permissions from member sharing,
-- and introduces a generic per-user hide layer for household-shareable records.

alter table if exists public.app_user_profiles
  add column if not exists wealth_has_mortgage boolean default false,
  add column if not exists wealth_has_pension boolean default false,
  add column if not exists wealth_has_investments boolean default false,
  add column if not exists wealth_has_savings boolean default false,
  add column if not exists wealth_has_credit_cards_or_loans boolean default false,
  add column if not exists wealth_has_childcare_costs boolean default false,
  add column if not exists wealth_has_car_finance boolean default false,
  add column if not exists wealth_has_business_income boolean default false;

alter table if exists public.app_household_members
  add column if not exists share_income boolean default true,
  add column if not exists share_spending boolean default true,
  add column if not exists share_savings boolean default true,
  add column if not exists share_investments boolean default true,
  add column if not exists share_health_summary boolean default false;

create table if not exists public.app_household_hidden_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid not null references public.app_households(id) on delete cascade,
  record_type text not null,
  record_id text not null,
  hidden_by_user_id uuid not null references auth.users(id) on delete cascade,
  hidden_reason text default 'user_hidden',
  hidden_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, household_id, record_type, record_id)
);

alter table public.app_household_hidden_records enable row level security;

drop policy if exists "Users can read their hidden household records" on public.app_household_hidden_records;
create policy "Users can read their hidden household records"
  on public.app_household_hidden_records for select
  using (auth.uid() = user_id or auth.uid() = hidden_by_user_id);

drop policy if exists "Users can hide their household records" on public.app_household_hidden_records;
create policy "Users can hide their household records"
  on public.app_household_hidden_records for insert
  with check (auth.uid() = user_id and auth.uid() = hidden_by_user_id);

drop policy if exists "Users can update their hidden household records" on public.app_household_hidden_records;
create policy "Users can update their hidden household records"
  on public.app_household_hidden_records for update
  using (auth.uid() = user_id and auth.uid() = hidden_by_user_id)
  with check (auth.uid() = user_id and auth.uid() = hidden_by_user_id);

drop policy if exists "Users can unhide their household records" on public.app_household_hidden_records;
create policy "Users can unhide their household records"
  on public.app_household_hidden_records for delete
  using (auth.uid() = user_id and auth.uid() = hidden_by_user_id);

create index if not exists app_household_hidden_records_household_idx
  on public.app_household_hidden_records (household_id, record_type, record_id);

create index if not exists app_household_hidden_records_user_idx
  on public.app_household_hidden_records (user_id, household_id);
