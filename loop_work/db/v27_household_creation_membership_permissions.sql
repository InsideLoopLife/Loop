-- v27_household_creation_membership_permissions.sql
-- Household creation UX, member removal/leave, invite status, usernames and safer permission scaffolding.

create extension if not exists pgcrypto;

alter table app_user_profiles add column if not exists username text;
alter table app_user_profiles add column if not exists household_id uuid;
alter table app_user_profiles add column if not exists email text;
alter table app_user_profiles add column if not exists full_name text;
alter table app_user_profiles add column if not exists display_name text;
alter table app_user_profiles add column if not exists avatar_url text;
alter table app_user_profiles add column if not exists updated_at timestamptz default now();
create unique index if not exists app_user_profiles_username_unique on app_user_profiles(lower(username)) where username is not null and username <> '';

alter table app_households add column if not exists owner_user_id uuid;
alter table app_households add column if not exists name text default 'My household';
alter table app_households add column if not exists timezone text default 'Europe/London';
alter table app_households add column if not exists currency text default 'GBP';
alter table app_households add column if not exists household_photo_url text;
alter table app_households add column if not exists created_at timestamptz default now();
alter table app_households add column if not exists updated_at timestamptz default now();

alter table app_household_members add column if not exists email text;
alter table app_household_members add column if not exists role text default 'member';
alter table app_household_members add column if not exists permission_tier text default 'member';
alter table app_household_members add column if not exists status text default 'active';
alter table app_household_members add column if not exists can_manage_people boolean not null default false;
alter table app_household_members add column if not exists can_manage_child_profiles boolean not null default false;
alter table app_household_members add column if not exists can_view_household_income boolean not null default false;
alter table app_household_members add column if not exists can_manage_household_costs boolean not null default false;
alter table app_household_members add column if not exists can_manage_integrations boolean not null default false;
alter table app_household_members add column if not exists removed_at timestamptz;
alter table app_household_members add column if not exists removed_by_user_id uuid;
alter table app_household_members add column if not exists created_at timestamptz default now();
alter table app_household_members add column if not exists updated_at timestamptz default now();

create unique index if not exists app_household_members_household_user_unique on app_household_members(household_id, user_id);
create index if not exists app_household_members_user_status_idx on app_household_members(user_id, status);
create index if not exists app_household_members_household_status_idx on app_household_members(household_id, status);

alter table household_join_invites add column if not exists invited_email_hash text;
alter table household_join_invites add column if not exists accepted_user_id uuid;
alter table household_join_invites add column if not exists accepted_at timestamptz;
alter table household_join_invites add column if not exists updated_at timestamptz default now();
create index if not exists household_join_invites_email_status_idx on household_join_invites(invited_email, status, expires_at);
create index if not exists household_join_invites_hash_status_idx on household_join_invites(invited_email_hash, status, expires_at);
create index if not exists household_join_invites_household_status_idx on household_join_invites(household_id, status, created_at desc);

alter table people add column if not exists maturity_date date;
alter table people add column if not exists invite_email text;
alter table people add column if not exists account_status text default 'managed_by_household';
alter table people add column if not exists linked_user_id uuid;
alter table people add column if not exists avatar_url text;
alter table people add column if not exists income_visible_to_household boolean not null default true;
alter table people add column if not exists costs_visible_to_household boolean not null default true;
alter table people add column if not exists household_can_add_costs boolean not null default true;

create table if not exists app_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  household_id uuid,
  notification_type text not null default 'general',
  severity text not null default 'info',
  status text not null default 'unread',
  title text not null,
  body text,
  cta_label text,
  cta_href text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists app_notifications_user_status_idx on app_notifications(user_id, status, created_at desc);

-- Replace older recursive household policies with conservative non-recursive policies.
alter table app_households enable row level security;
alter table app_household_members enable row level security;

drop policy if exists app_households_select_member on app_households;
drop policy if exists app_households_owner_update on app_households;
drop policy if exists app_households_owner_insert on app_households;
drop policy if exists app_household_members_select_self on app_household_members;

create policy app_households_select_member on app_households
for select using (
  owner_user_id = auth.uid()
  or id in (select household_id from app_household_members where user_id = auth.uid() and status = 'active')
);

create policy app_households_owner_update on app_households
for update using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

create policy app_households_owner_insert on app_households
for insert with check (owner_user_id = auth.uid());

create policy app_household_members_select_self on app_household_members
for select using (user_id = auth.uid());
