-- V24.1: person account identity/visibility + income query safety columns.
-- Run after V24. This is additive and safe to re-run.

alter table if exists people add column if not exists email text;
alter table if exists people add column if not exists linked_user_id uuid references auth.users(id) on delete set null;
alter table if exists people add column if not exists account_status text not null default 'managed_by_household' check (account_status in ('managed_by_household','invite_needed','invited','linked','child_until_18','removed_from_household'));
alter table if exists people add column if not exists invite_email text;
alter table if exists people add column if not exists invite_notes text;
alter table if exists people add column if not exists income_visible_to_household boolean not null default true;
alter table if exists people add column if not exists costs_visible_to_household boolean not null default true;
alter table if exists people add column if not exists household_can_add_costs boolean not null default true;
alter table if exists people add column if not exists maturity_date date;
alter table if exists people add column if not exists account_setup_prompted_at timestamptz;

-- Some installs skipped earlier payment-timing migrations; dashboard selects these columns.
alter table if exists pay_events add column if not exists pay_timing text default 'last_workday';
alter table if exists pay_events add column if not exists pay_day_of_month integer default 28;
alter table if exists pay_events add column if not exists pay_adjustment text default 'previous_workday';
alter table if exists pay_events add column if not exists notes text;

alter table if exists income_entries add column if not exists payment_timing text default 'last_workday';
alter table if exists income_entries add column if not exists pay_day_of_month integer;
alter table if exists income_entries add column if not exists payment_adjustment text default 'previous_workday';
alter table if exists income_entries add column if not exists archived_at timestamptz;
alter table if exists income_entries add column if not exists notes text;

-- Link-account prompts are deliberately lightweight. Auth/passwords remain in Supabase Auth.
create table if not exists person_account_prompts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  person_id uuid references people(id) on delete cascade,
  email text,
  prompt_type text not null default 'invite_to_create_account',
  status text not null default 'draft' check (status in ('draft','ready','sent','accepted','cancelled')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table person_account_prompts enable row level security;

do $$ begin
  create policy "Users manage person account prompts" on person_account_prompts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';
