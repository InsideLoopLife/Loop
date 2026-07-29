-- v28.94 Household-aware spending allocation, payment accounts, pets and benefit guidance.
alter table if exists public.planned_items
  add column if not exists payment_account_id uuid references public.financial_accounts(id) on delete set null,
  add column if not exists pet_id uuid;
alter table if exists public.spending_entries
  add column if not exists payment_account_id uuid references public.financial_accounts(id) on delete set null,
  add column if not exists pet_id uuid;
alter table if exists public.child_costs
  add column if not exists payment_account_id uuid references public.financial_accounts(id) on delete set null;

create table if not exists public.household_pets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.app_households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  species text not null default 'dog',
  breed text,
  birth_date date,
  avatar_url text,
  insurer text,
  vet_name text,
  notes text,
  status text not null default 'active' check (status in ('active','archived','deceased')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  alter table public.planned_items add constraint planned_items_pet_id_fkey foreign key (pet_id) references public.household_pets(id) on delete set null;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.spending_entries add constraint spending_entries_pet_id_fkey foreign key (pet_id) references public.household_pets(id) on delete set null;
exception when duplicate_object then null; end $$;

create table if not exists public.spending_person_allocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid references public.app_households(id) on delete cascade,
  planned_item_id uuid references public.planned_items(id) on delete cascade,
  spending_entry_id uuid references public.spending_entries(id) on delete cascade,
  person_id uuid references public.people(id) on delete cascade,
  allocation_percent numeric(5,2) not null check (allocation_percent > 0 and allocation_percent <= 100),
  created_at timestamptz not null default now(),
  check ((planned_item_id is not null)::int + (spending_entry_id is not null)::int = 1),
  unique (planned_item_id, person_id),
  unique (spending_entry_id, person_id)
);

alter table public.household_pets enable row level security;
alter table public.spending_person_allocations enable row level security;

drop policy if exists "household pets visible to household" on public.household_pets;
create policy "household pets visible to household" on public.household_pets for select using (
  user_id = auth.uid() or household_id in (select household_id from public.app_household_members where user_id = auth.uid() and status = 'active')
);
drop policy if exists "household pets writable by household" on public.household_pets;
create policy "household pets writable by household" on public.household_pets for all using (
  user_id = auth.uid() or household_id in (select household_id from public.app_household_members where user_id = auth.uid() and status = 'active')
) with check (
  user_id = auth.uid() or household_id in (select household_id from public.app_household_members where user_id = auth.uid() and status = 'active')
);

drop policy if exists "spending allocations visible to household" on public.spending_person_allocations;
create policy "spending allocations visible to household" on public.spending_person_allocations for select using (
  user_id = auth.uid() or household_id in (select household_id from public.app_household_members where user_id = auth.uid() and status = 'active')
);
drop policy if exists "spending allocations writable by household" on public.spending_person_allocations;
create policy "spending allocations writable by household" on public.spending_person_allocations for all using (
  user_id = auth.uid() or household_id in (select household_id from public.app_household_members where user_id = auth.uid() and status = 'active')
) with check (
  user_id = auth.uid() or household_id in (select household_id from public.app_household_members where user_id = auth.uid() and status = 'active')
);

create index if not exists planned_items_payment_account_idx on public.planned_items(payment_account_id);
create index if not exists spending_entries_payment_account_idx on public.spending_entries(payment_account_id);
create index if not exists spending_allocations_person_idx on public.spending_person_allocations(person_id);

-- Merge only unambiguous legacy duplicates. User-created specialist categories remain untouched.
do $$
declare
  duplicate_row record;
  canonical_id uuid;
begin
  for duplicate_row in
    select id, user_id, lower(name) as clean_name, monthly_budget
    from public.spending_categories
    where lower(name) in ('streaming', 'travel')
  loop
    select id into canonical_id
    from public.spending_categories
    where user_id = duplicate_row.user_id
      and (
        (duplicate_row.clean_name = 'streaming' and (standard_category_key = 'subscriptions' or lower(name) = 'subscriptions'))
        or (duplicate_row.clean_name = 'travel' and (standard_category_key = 'transport' or lower(name) = 'transport'))
      )
    order by is_standard_category desc nulls last
    limit 1;

    if canonical_id is not null and canonical_id <> duplicate_row.id then
      update public.planned_items set category_id = canonical_id where category_id = duplicate_row.id;
      update public.spending_entries set category_id = canonical_id where category_id = duplicate_row.id;
      update public.spending_categories
        set monthly_budget = greatest(coalesce(monthly_budget, 0), coalesce(duplicate_row.monthly_budget, 0))
        where id = canonical_id;
      delete from public.spending_categories where id = duplicate_row.id;
    end if;
    canonical_id := null;
  end loop;
end $$;

notify pgrst, 'reload schema';
