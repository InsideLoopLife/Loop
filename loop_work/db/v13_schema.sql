-- V13.1: Banking CSV import and regular-payment detection.
-- Imports bank CSV transactions, stores them privately, and suggests recurring payments
-- that can be accepted into the Spending Planner as normal monthly items.

-- V13.1 dependency safety patch: ensure the Spending Planner planned_items table exists.
-- Some installs skipped/failed the V8 migration, so V13 could fail when referencing planned_items.

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
