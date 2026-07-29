-- v24_6_stable_auth_household_invites_maternity.sql
-- Stable household RLS, person invite/claim flow and NHS maternity calculation support.

create extension if not exists pgcrypto;

alter table if exists app_households
  add column if not exists name text default 'My household',
  add column if not exists timezone text default 'Europe/London',
  add column if not exists currency text default 'GBP',
  add column if not exists updated_at timestamptz default now();

alter table if exists app_household_members
  add column if not exists email text,
  add column if not exists role text default 'member',
  add column if not exists permission_tier text default 'member',
  add column if not exists status text default 'active',
  add column if not exists can_manage_people boolean default false,
  add column if not exists can_manage_child_profiles boolean default false,
  add column if not exists can_view_household_income boolean default false,
  add column if not exists can_manage_household_costs boolean default false,
  add column if not exists can_manage_integrations boolean default false,
  add column if not exists updated_at timestamptz default now();

alter table if exists people
  add column if not exists email text,
  add column if not exists invite_email text,
  add column if not exists linked_user_id uuid references auth.users(id) on delete set null,
  add column if not exists account_status text default 'managed_by_household',
  add column if not exists account_setup_prompted_at timestamptz,
  add column if not exists income_visible_to_household boolean default true,
  add column if not exists costs_visible_to_household boolean default true,
  add column if not exists household_can_add_costs boolean default true,
  add column if not exists maturity_date date,
  add column if not exists avatar_url text,
  add column if not exists updated_at timestamptz default now();

alter table if exists pay_events
  add column if not exists pay_timing text default 'last_workday',
  add column if not exists pay_day_of_month integer default 28,
  add column if not exists pay_adjustment text default 'previous_workday',
  add column if not exists maternity_pay_mode text,
  add column if not exists maternity_scheme text,
  add column if not exists maternity_leave_start date,
  add column if not exists maternity_leave_end date,
  add column if not exists maternity_full_pay_weeks numeric default 8,
  add column if not exists maternity_half_pay_weeks numeric default 18,
  add column if not exists maternity_smp_only_weeks numeric default 13,
  add column if not exists maternity_unpaid_weeks numeric default 13,
  add column if not exists maternity_smp_weekly_rate numeric default 194.32;

create table if not exists person_account_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references app_households(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  invited_by_user_id uuid references auth.users(id) on delete set null,
  email text not null,
  relationship text,
  token_hash text not null unique,
  status text not null default 'pending',
  expires_at timestamptz,
  accepted_at timestamptz,
  accepted_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists person_account_invites_person_idx on person_account_invites(person_id);
create index if not exists person_account_invites_household_idx on person_account_invites(household_id);
create unique index if not exists app_household_members_household_user_uidx on app_household_members(household_id, user_id);

alter table person_account_invites enable row level security;
drop policy if exists "person_account_invites_owner_select" on person_account_invites;
drop policy if exists "person_account_invites_owner_insert" on person_account_invites;
drop policy if exists "person_account_invites_owner_update" on person_account_invites;
drop policy if exists "person_account_invites_recipient_select" on person_account_invites;

-- RLS-safe helper functions. These are SECURITY DEFINER and explicitly run with row_security off
-- to avoid app_households <-> app_household_members policy recursion.
create or replace function public.loop_is_household_owner(h_id uuid)
returns boolean
language sql
security definer
set search_path = public
set row_security = off
stable
as $$
  select exists (
    select 1 from public.app_households h
    where h.id = h_id and h.owner_user_id = auth.uid()
  );
$$;

create or replace function public.loop_is_household_member(h_id uuid)
returns boolean
language sql
security definer
set search_path = public
set row_security = off
stable
as $$
  select exists (
    select 1 from public.app_household_members m
    where m.household_id = h_id
      and m.user_id = auth.uid()
      and coalesce(m.status, 'active') = 'active'
  );
$$;

create or replace function public.loop_can_manage_household(h_id uuid)
returns boolean
language sql
security definer
set search_path = public
set row_security = off
stable
as $$
  select exists (
    select 1 from public.app_households h
    where h.id = h_id and h.owner_user_id = auth.uid()
  ) or exists (
    select 1 from public.app_household_members m
    where m.household_id = h_id
      and m.user_id = auth.uid()
      and coalesce(m.status, 'active') = 'active'
      and coalesce(m.permission_tier, 'member') in ('owner','admin','parent')
  );
$$;

grant execute on function public.loop_is_household_owner(uuid) to authenticated;
grant execute on function public.loop_is_household_member(uuid) to authenticated;
grant execute on function public.loop_can_manage_household(uuid) to authenticated;

alter table app_households enable row level security;
alter table app_household_members enable row level security;

-- Drop every known version of the household policies so this migration is safely rerunnable.
drop policy if exists "households_select_member" on app_households;
drop policy if exists "households_insert_owner" on app_households;
drop policy if exists "households_update_owner" on app_households;
drop policy if exists "households_update_owner_or_admin" on app_households;
drop policy if exists "households_select_member_v245" on app_households;
drop policy if exists "households_insert_owner_v245" on app_households;
drop policy if exists "households_update_owner_or_admin_v245" on app_households;
drop policy if exists "households_select_member_v246" on app_households;
drop policy if exists "households_insert_owner_v246" on app_households;
drop policy if exists "households_update_owner_or_admin_v246" on app_households;

create policy "households_select_member_v246" on app_households
for select using (owner_user_id = auth.uid() or public.loop_is_household_member(id));

create policy "households_insert_owner_v246" on app_households
for insert with check (owner_user_id = auth.uid());

create policy "households_update_owner_or_admin_v246" on app_households
for update using (owner_user_id = auth.uid() or public.loop_can_manage_household(id))
with check (owner_user_id = auth.uid() or public.loop_can_manage_household(id));

drop policy if exists "members_select_self_or_owner" on app_household_members;
drop policy if exists "members_insert_self" on app_household_members;
drop policy if exists "members_update_owner" on app_household_members;
drop policy if exists "members_select_self_or_household_admin" on app_household_members;
drop policy if exists "members_insert_owner_or_self" on app_household_members;
drop policy if exists "members_update_owner_or_admin" on app_household_members;
drop policy if exists "members_select_self_or_household_admin_v245" on app_household_members;
drop policy if exists "members_insert_owner_or_self_v245" on app_household_members;
drop policy if exists "members_update_owner_or_admin_v245" on app_household_members;
drop policy if exists "members_select_self_or_household_admin_v246" on app_household_members;
drop policy if exists "members_insert_owner_or_self_v246" on app_household_members;
drop policy if exists "members_update_owner_or_admin_v246" on app_household_members;

create policy "members_select_self_or_household_admin_v246" on app_household_members
for select using (user_id = auth.uid() or public.loop_can_manage_household(household_id));

create policy "members_insert_owner_or_self_v246" on app_household_members
for insert with check (user_id = auth.uid() and public.loop_is_household_owner(household_id));

create policy "members_update_owner_or_admin_v246" on app_household_members
for update using (user_id = auth.uid() or public.loop_can_manage_household(household_id))
with check (user_id = auth.uid() or public.loop_can_manage_household(household_id));

create policy "person_account_invites_owner_select" on person_account_invites
for select using (public.loop_can_manage_household(household_id) or lower(email) = lower(coalesce(auth.email(), '')));
create policy "person_account_invites_owner_insert" on person_account_invites
for insert with check (public.loop_can_manage_household(household_id));
create policy "person_account_invites_owner_update" on person_account_invites
for update using (public.loop_can_manage_household(household_id) or lower(email) = lower(coalesce(auth.email(), '')))
with check (public.loop_can_manage_household(household_id) or lower(email) = lower(coalesce(auth.email(), '')));

update app_household_members m
set role = 'owner', permission_tier = 'owner', status = 'active',
    can_manage_people = true, can_manage_child_profiles = true,
    can_view_household_income = true, can_manage_household_costs = true,
    can_manage_integrations = true, updated_at = now()
from app_households h
where h.id = m.household_id and h.owner_user_id = m.user_id;

insert into storage.buckets (id, name, public)
values ('user-avatars', 'user-avatars', true), ('person-avatars', 'person-avatars', true)
on conflict (id) do update set public = excluded.public;
