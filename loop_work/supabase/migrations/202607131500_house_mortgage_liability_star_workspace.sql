begin;

create table if not exists public.home_mortgage_liability_allocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  owner_user_id uuid references auth.users(id) on delete set null,
  created_by_user_id uuid references auth.users(id) on delete set null,
  household_id uuid references public.app_households(id) on delete cascade,
  visibility_scope text not null default 'private' check (visibility_scope in ('private','household')),
  home_mortgage_deal_id uuid not null references public.home_mortgage_deals(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  liability_percent numeric(7,4) not null default 0 check (liability_percent >= 0 and liability_percent <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(home_mortgage_deal_id, person_id)
);

create index if not exists home_mortgage_liability_deal_idx
  on public.home_mortgage_liability_allocations(home_mortgage_deal_id);
create index if not exists home_mortgage_liability_household_idx
  on public.home_mortgage_liability_allocations(household_id);

create table if not exists public.mortgage_deal_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  home_id uuid references public.homes(id) on delete cascade,
  source_kind text not null check (source_kind in ('market','recommendation')),
  source_id uuid not null,
  is_shortlisted boolean not null default false,
  is_starred boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, source_kind, source_id)
);

create index if not exists mortgage_deal_preferences_user_idx
  on public.mortgage_deal_preferences(user_id, home_id);
create unique index if not exists mortgage_deal_preferences_one_star_per_home_idx
  on public.mortgage_deal_preferences(user_id, coalesce(home_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where is_starred = true;

create table if not exists public.mortgage_workspace_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  moving_home_label text not null default 'Moving home',
  moving_home_description text not null default 'Saved searches and move costs',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(moving_home_label) between 1 and 40),
  check (char_length(moving_home_description) between 1 and 120)
);

alter table public.home_mortgage_liability_allocations enable row level security;
alter table public.mortgage_deal_preferences enable row level security;
alter table public.mortgage_workspace_preferences enable row level security;

drop policy if exists home_mortgage_liability_read on public.home_mortgage_liability_allocations;
create policy home_mortgage_liability_read on public.home_mortgage_liability_allocations
for select to authenticated
using (
  user_id = auth.uid()
  or (
    visibility_scope = 'household'
    and household_id is not null
    and exists (
      select 1 from public.app_household_members m
      where m.household_id = home_mortgage_liability_allocations.household_id
        and m.user_id = auth.uid()
        and coalesce(m.status, 'active') = 'active'
    )
  )
);

drop policy if exists home_mortgage_liability_insert on public.home_mortgage_liability_allocations;
create policy home_mortgage_liability_insert on public.home_mortgage_liability_allocations
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists home_mortgage_liability_update on public.home_mortgage_liability_allocations;
create policy home_mortgage_liability_update on public.home_mortgage_liability_allocations
for update to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.app_household_members m
    where m.household_id = home_mortgage_liability_allocations.household_id
      and m.user_id = auth.uid()
      and coalesce(m.status, 'active') = 'active'
      and coalesce(m.permission_tier, 'member') in ('owner','admin','parent','parent_admin')
  )
)
with check (
  user_id = auth.uid()
  or exists (
    select 1 from public.app_household_members m
    where m.household_id = home_mortgage_liability_allocations.household_id
      and m.user_id = auth.uid()
      and coalesce(m.status, 'active') = 'active'
      and coalesce(m.permission_tier, 'member') in ('owner','admin','parent','parent_admin')
  )
);

drop policy if exists home_mortgage_liability_delete on public.home_mortgage_liability_allocations;
create policy home_mortgage_liability_delete on public.home_mortgage_liability_allocations
for delete to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.app_household_members m
    where m.household_id = home_mortgage_liability_allocations.household_id
      and m.user_id = auth.uid()
      and coalesce(m.status, 'active') = 'active'
      and coalesce(m.permission_tier, 'member') in ('owner','admin','parent','parent_admin')
  )
);

drop policy if exists mortgage_deal_preferences_owner on public.mortgage_deal_preferences;
create policy mortgage_deal_preferences_owner on public.mortgage_deal_preferences
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists mortgage_workspace_preferences_owner on public.mortgage_workspace_preferences;
create policy mortgage_workspace_preferences_owner on public.mortgage_workspace_preferences
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

commit;
