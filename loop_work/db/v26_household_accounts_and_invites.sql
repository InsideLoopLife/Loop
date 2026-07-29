-- v26_household_accounts_and_invites.sql
-- Normal-user household creation, active household switching, explicit invite acceptance, and notification surfacing.

create extension if not exists pgcrypto;

alter table app_user_profiles add column if not exists household_id uuid;
alter table app_user_profiles add column if not exists email text;
alter table app_user_profiles add column if not exists updated_at timestamptz default now();

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
alter table app_household_members add column if not exists created_at timestamptz default now();
alter table app_household_members add column if not exists updated_at timestamptz default now();

create unique index if not exists app_household_members_household_user_unique on app_household_members(household_id, user_id);
create index if not exists app_household_members_user_status_idx on app_household_members(user_id, status);
create index if not exists app_user_profiles_active_household_idx on app_user_profiles(user_id, household_id);

create table if not exists household_join_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references app_households(id) on delete cascade,
  invited_by_user_id uuid not null,
  invited_email text,
  invited_email_hash text,
  token_hash text not null unique,
  short_code text not null unique,
  role text not null default 'member',
  permission_tier text not null default 'member',
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_user_id uuid,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table household_join_invites add column if not exists invited_email_hash text;
alter table household_join_invites add column if not exists accepted_user_id uuid;
alter table household_join_invites add column if not exists accepted_at timestamptz;
create index if not exists household_join_invites_email_status_idx on household_join_invites(invited_email, status, expires_at);
create index if not exists household_join_invites_hash_status_idx on household_join_invites(invited_email_hash, status, expires_at);

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
create index if not exists app_notifications_user_href_idx on app_notifications(user_id, cta_href);

-- RLS remains conservative; server-side service-role actions perform invite acceptance/creation.
alter table household_join_invites enable row level security;
drop policy if exists household_join_invites_member_select on household_join_invites;
create policy household_join_invites_member_select on household_join_invites for select using (
  exists (
    select 1 from app_household_members m
    where m.household_id = household_join_invites.household_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and (m.permission_tier in ('owner','admin') or m.can_manage_people = true)
  )
);
