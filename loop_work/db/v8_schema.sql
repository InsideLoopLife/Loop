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
