-- v24_5_account_email_household_policy_fix.sql
-- Fixes app_households/app_household_members RLS recursion and adds safer email/account scaffolding.

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

-- Storage buckets for profile images. Buckets stay public because pages use public image URLs;
-- do not use these buckets for sensitive documents or finance files.
insert into storage.buckets (id, name, public)
values ('user-avatars', 'user-avatars', true), ('person-avatars', 'person-avatars', true)
on conflict (id) do update set public = excluded.public;

-- RLS-safe helper functions. SECURITY DEFINER avoids a circular policy chain where
-- app_households checks app_household_members and app_household_members checks app_households.
create or replace function public.loop_is_household_owner(h_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.app_households h
    where h.id = h_id
      and h.owner_user_id = auth.uid()
  );
$$;

create or replace function public.loop_is_household_member(h_id uuid)
returns boolean
language sql
security definer
set search_path = public
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
stable
as $$
  select exists (
    select 1 from public.app_households h
    where h.id = h_id
      and h.owner_user_id = auth.uid()
  ) or exists (
    select 1 from public.app_household_members m
    where m.household_id = h_id
      and m.user_id = auth.uid()
      and coalesce(m.status, 'active') = 'active'
      and coalesce(m.permission_tier, 'member') in ('owner', 'admin', 'parent')
  );
$$;

grant execute on function public.loop_is_household_owner(uuid) to authenticated;
grant execute on function public.loop_is_household_member(uuid) to authenticated;
grant execute on function public.loop_can_manage_household(uuid) to authenticated;

alter table app_households enable row level security;
alter table app_household_members enable row level security;

-- Drop older recursive policies and recreate non-recursive equivalents.
drop policy if exists "households_select_member" on app_households;
drop policy if exists "households_insert_owner" on app_households;
drop policy if exists "households_update_owner" on app_households;
drop policy if exists "households_update_owner_or_admin" on app_households;

create policy "households_select_member_v245" on app_households
for select using (
  owner_user_id = auth.uid()
  or public.loop_is_household_member(id)
);

create policy "households_insert_owner_v245" on app_households
for insert with check (owner_user_id = auth.uid());

create policy "households_update_owner_or_admin_v245" on app_households
for update using (
  owner_user_id = auth.uid()
  or public.loop_can_manage_household(id)
)
with check (
  owner_user_id = auth.uid()
  or public.loop_can_manage_household(id)
);

drop policy if exists "members_select_self_or_owner" on app_household_members;
drop policy if exists "members_insert_self" on app_household_members;
drop policy if exists "members_update_owner" on app_household_members;
drop policy if exists "members_select_self_or_household_admin" on app_household_members;
drop policy if exists "members_insert_owner_or_self" on app_household_members;
drop policy if exists "members_update_owner_or_admin" on app_household_members;

create policy "members_select_self_or_household_admin_v245" on app_household_members
for select using (
  user_id = auth.uid()
  or public.loop_can_manage_household(household_id)
);

create policy "members_insert_owner_or_self_v245" on app_household_members
for insert with check (
  user_id = auth.uid()
  and public.loop_is_household_owner(household_id)
);

create policy "members_update_owner_or_admin_v245" on app_household_members
for update using (
  user_id = auth.uid()
  or public.loop_can_manage_household(household_id)
)
with check (
  user_id = auth.uid()
  or public.loop_can_manage_household(household_id)
);

-- Mark the owner's membership consistently if it already exists.
update app_household_members m
set role = 'owner',
    permission_tier = 'owner',
    status = 'active',
    can_manage_people = true,
    can_manage_child_profiles = true,
    can_view_household_income = true,
    can_manage_household_costs = true,
    can_manage_integrations = true,
    updated_at = now()
from app_households h
where h.id = m.household_id
  and h.owner_user_id = m.user_id;

-- Keep person account fields available for invite/link flows.
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
