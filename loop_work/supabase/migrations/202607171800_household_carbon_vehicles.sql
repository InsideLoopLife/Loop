create table if not exists public.household_carbon_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid not null references public.app_households(id) on delete cascade,
  food_assumption_adopted boolean not null default false,
  annual_offset_kg numeric not null default 0,
  offset_provider text,
  offset_notes text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (household_id)
);

create table if not exists public.household_vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid not null references public.app_households(id) on delete cascade,
  name text not null,
  registration text,
  owner_person_id uuid references public.people(id) on delete set null,
  make_model text,
  fuel_type text not null default 'petrol',
  annual_miles numeric,
  mpg numeric,
  monthly_finance numeric,
  insurer text,
  insurance_renewal_date date,
  status text not null default 'active' check (status in ('active','archived')),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.household_vehicles add column if not exists registration text;
alter table public.household_vehicles add column if not exists owner_person_id uuid references public.people(id) on delete set null;

alter table public.household_carbon_profiles enable row level security;
alter table public.household_vehicles enable row level security;

drop policy if exists "household carbon visible to household" on public.household_carbon_profiles;
create policy "household carbon visible to household" on public.household_carbon_profiles for select using (
  user_id = auth.uid() or household_id in (
    select household_id from public.app_household_members where user_id = auth.uid() and status = 'active'
  )
);
drop policy if exists "household carbon writable by household" on public.household_carbon_profiles;
create policy "household carbon writable by household" on public.household_carbon_profiles for all using (
  user_id = auth.uid() or household_id in (
    select household_id from public.app_household_members where user_id = auth.uid() and status = 'active'
  )
) with check (
  user_id = auth.uid() or household_id in (
    select household_id from public.app_household_members where user_id = auth.uid() and status = 'active'
  )
);

drop policy if exists "household vehicles visible to household" on public.household_vehicles;
create policy "household vehicles visible to household" on public.household_vehicles for select using (
  user_id = auth.uid() or household_id in (
    select household_id from public.app_household_members where user_id = auth.uid() and status = 'active'
  )
);
drop policy if exists "household vehicles writable by household" on public.household_vehicles;
create policy "household vehicles writable by household" on public.household_vehicles for all using (
  user_id = auth.uid() or household_id in (
    select household_id from public.app_household_members where user_id = auth.uid() and status = 'active'
  )
) with check (
  user_id = auth.uid() or household_id in (
    select household_id from public.app_household_members where user_id = auth.uid() and status = 'active'
  )
);

select pg_notify('pgrst', 'reload schema');
