
-- v25_auth_household_sharing_modular.sql
-- Custom email-code auth flows, household sharing/invites, and module separation support.

create extension if not exists pgcrypto;

create table if not exists auth_action_codes (
  id uuid primary key default gen_random_uuid(),
  purpose text not null check (purpose in ('password_reset','signup_email_verify','household_invite')),
  email text not null,
  email_hash text not null,
  code_hash text not null,
  user_id uuid,
  household_id uuid,
  person_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists auth_action_codes_lookup_idx on auth_action_codes (purpose, email_hash, created_at desc);
create index if not exists auth_action_codes_expiry_idx on auth_action_codes (expires_at) where consumed_at is null;

alter table auth_action_codes enable row level security;

drop policy if exists "auth action codes are server only" on auth_action_codes;
create policy "auth action codes are server only" on auth_action_codes for all using (false) with check (false);

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

create index if not exists household_join_invites_household_idx on household_join_invites (household_id, created_at desc);
create index if not exists household_join_invites_status_idx on household_join_invites (status, expires_at);

alter table household_join_invites enable row level security;

drop policy if exists household_join_invites_member_select on household_join_invites;
drop policy if exists household_join_invites_member_insert on household_join_invites;
drop policy if exists household_join_invites_member_update on household_join_invites;

create policy household_join_invites_member_select on household_join_invites
for select using (
  exists (
    select 1 from app_household_members m
    where m.household_id = household_join_invites.household_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and (m.permission_tier in ('owner','admin','parent') or m.can_manage_people = true)
  )
);

create policy household_join_invites_member_insert on household_join_invites
for insert with check (
  invited_by_user_id = auth.uid()
  and exists (
    select 1 from app_household_members m
    where m.household_id = household_join_invites.household_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and (m.permission_tier in ('owner','admin') or m.can_manage_people = true)
  )
);

create policy household_join_invites_member_update on household_join_invites
for update using (
  exists (
    select 1 from app_household_members m
    where m.household_id = household_join_invites.household_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and (m.permission_tier in ('owner','admin') or m.can_manage_people = true)
  )
) with check (
  exists (
    select 1 from app_household_members m
    where m.household_id = household_join_invites.household_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and (m.permission_tier in ('owner','admin') or m.can_manage_people = true)
  )
);

create table if not exists household_join_requests (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references app_households(id) on delete cascade,
  invite_id uuid references household_join_invites(id) on delete set null,
  requester_user_id uuid not null,
  requester_email text,
  status text not null default 'pending' check (status in ('pending','approved','declined','cancelled')),
  requested_at timestamptz not null default now(),
  decided_by_user_id uuid,
  decided_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

alter table household_join_requests enable row level security;

drop policy if exists household_join_requests_requester_select on household_join_requests;
drop policy if exists household_join_requests_member_select on household_join_requests;

create policy household_join_requests_requester_select on household_join_requests
for select using (requester_user_id = auth.uid());

create policy household_join_requests_member_select on household_join_requests
for select using (
  exists (
    select 1 from app_household_members m
    where m.household_id = household_join_requests.household_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and (m.permission_tier in ('owner','admin') or m.can_manage_people = true)
  )
);

-- Make sure account profile supports household linkage and personal display.
alter table app_user_profiles add column if not exists household_id uuid;
alter table app_user_profiles add column if not exists full_name text;
alter table app_user_profiles add column if not exists avatar_url text;
alter table app_user_profiles add column if not exists phone_number text;
alter table app_user_profiles add column if not exists identity_verification_status text default 'unverified';

-- Keep household metadata simple and personal.
alter table app_households add column if not exists invite_code_prefix text;
alter table app_households add column if not exists household_photo_url text;

-- Support person/account ownership and visibility.
alter table people add column if not exists linked_user_id uuid;
alter table people add column if not exists email text;
alter table people add column if not exists invite_email text;
alter table people add column if not exists account_status text default 'managed_by_household';
alter table people add column if not exists income_visible_to_household boolean not null default true;
alter table people add column if not exists costs_visible_to_household boolean not null default true;
alter table people add column if not exists household_can_add_costs boolean not null default true;

-- Optional module boundary metadata for future product separation.
create table if not exists app_modules (
  id uuid primary key default gen_random_uuid(),
  module_key text not null unique,
  display_name text not null,
  module_group text not null check (module_group in ('wealth','health','shared','admin')),
  description text,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

insert into app_modules (module_key, display_name, module_group, description) values
('wealth.dashboard','Overview','wealth','Household financial timeline and affordability view'),
('wealth.income','Income','wealth','Pay events, salary, maternity and income archive'),
('wealth.spending','Spending','wealth','Bills, planned costs, bank imports and renewals'),
('wealth.mortgage','Mortgage','wealth','Homes, mortgages, rates and move planning'),
('wealth.investments','Investments','wealth','Pensions, defined benefit and investment pots'),
('health.lifestyle','Lifestyle','health','Food shopping, meals, macro/micro tracker'),
('shared.household','Household','shared','People, accounts, sharing and permissions'),
('shared.account','Account','shared','Identity, security and notification settings')
on conflict (module_key) do update set
  display_name = excluded.display_name,
  module_group = excluded.module_group,
  description = excluded.description,
  is_enabled = excluded.is_enabled;
