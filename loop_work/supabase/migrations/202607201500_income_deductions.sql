begin;

create table if not exists public.income_deductions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  owner_user_id uuid references auth.users(id) on delete set null,
  created_by_user_id uuid references auth.users(id) on delete set null,
  household_id uuid references public.app_households(id) on delete cascade,
  visibility_scope text not null default 'household' check (visibility_scope in ('private','household')),
  person_id uuid references public.people(id) on delete set null,
  deduction_type text not null check (deduction_type in ('car_salary_sacrifice', 'cycle_to_work', 'additional_pension', 'other')),
  label text not null check (char_length(label) between 1 and 80),
  monthly_amount numeric(12,2) not null default 0,
  notes text,
  effective_from date not null default current_date,
  effective_until date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists income_deductions_household_idx
  on public.income_deductions(household_id);
create index if not exists income_deductions_person_idx
  on public.income_deductions(person_id);

alter table public.income_deductions enable row level security;

drop policy if exists income_deductions_read on public.income_deductions;
create policy income_deductions_read on public.income_deductions
for select to authenticated
using (
  user_id = auth.uid()
  or (
    visibility_scope = 'household'
    and household_id is not null
    and exists (
      select 1 from public.app_household_members m
      where m.household_id = income_deductions.household_id
        and m.user_id = auth.uid()
        and coalesce(m.status, 'active') = 'active'
    )
  )
);

drop policy if exists income_deductions_insert on public.income_deductions;
create policy income_deductions_insert on public.income_deductions
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists income_deductions_update on public.income_deductions;
create policy income_deductions_update on public.income_deductions
for update to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.app_household_members m
    where m.household_id = income_deductions.household_id
      and m.user_id = auth.uid()
      and coalesce(m.status, 'active') = 'active'
      and coalesce(m.permission_tier, 'member') in ('owner','admin','parent','parent_admin')
  )
)
with check (
  user_id = auth.uid()
  or exists (
    select 1 from public.app_household_members m
    where m.household_id = income_deductions.household_id
      and m.user_id = auth.uid()
      and coalesce(m.status, 'active') = 'active'
      and coalesce(m.permission_tier, 'member') in ('owner','admin','parent','parent_admin')
  )
);

drop policy if exists income_deductions_delete on public.income_deductions;
create policy income_deductions_delete on public.income_deductions
for delete to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.app_household_members m
    where m.household_id = income_deductions.household_id
      and m.user_id = auth.uid()
      and coalesce(m.status, 'active') = 'active'
      and coalesce(m.permission_tier, 'member') in ('owner','admin','parent','parent_admin')
  )
);

notify pgrst, 'reload schema';

commit;
