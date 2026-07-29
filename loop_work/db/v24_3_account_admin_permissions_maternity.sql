-- V24.3 account/admin/permissions and maternity exact-month overrides.
-- Safe to run after V24.2. Uses additive columns/tables only.

create extension if not exists pgcrypto;

alter table if exists app_user_profiles
  add column if not exists full_name text,
  add column if not exists avatar_url text,
  add column if not exists phone_number text,
  add column if not exists identity_verification_status text default 'unverified',
  add column if not exists identity_verified_at timestamptz,
  add column if not exists default_household_id uuid,
  add column if not exists date_display_format text default 'age_and_date',
  add column if not exists default_person_image_mode text default 'avatar_url';

alter table if exists app_households
  add column if not exists name text default 'Household',
  add column if not exists household_code text unique,
  add column if not exists timezone text default 'Europe/London',
  add column if not exists currency text default 'GBP',
  add column if not exists updated_at timestamptz default now();

update app_households
set household_code = coalesce(household_code, upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)))
where household_code is null;

alter table if exists app_household_members
  add column if not exists email text,
  add column if not exists role text default 'member',
  add column if not exists permission_tier text default 'member',
  add column if not exists can_manage_people boolean default false,
  add column if not exists can_manage_child_profiles boolean default false,
  add column if not exists can_view_household_income boolean default false,
  add column if not exists can_manage_household_costs boolean default false,
  add column if not exists can_manage_integrations boolean default false,
  add column if not exists updated_at timestamptz default now();

update app_household_members
set role = case when role is null and user_id in (select owner_user_id from app_households where app_households.id = app_household_members.household_id) then 'owner' else coalesce(role, 'member') end,
    permission_tier = case when permission_tier is null and user_id in (select owner_user_id from app_households where app_households.id = app_household_members.household_id) then 'owner' else coalesce(permission_tier, 'member') end,
    can_manage_people = coalesce(can_manage_people, user_id in (select owner_user_id from app_households where app_households.id = app_household_members.household_id)),
    can_manage_child_profiles = coalesce(can_manage_child_profiles, user_id in (select owner_user_id from app_households where app_households.id = app_household_members.household_id)),
    can_view_household_income = coalesce(can_view_household_income, true),
    can_manage_household_costs = coalesce(can_manage_household_costs, user_id in (select owner_user_id from app_households where app_households.id = app_household_members.household_id)),
    can_manage_integrations = coalesce(can_manage_integrations, user_id in (select owner_user_id from app_households where app_households.id = app_household_members.household_id));

alter table if exists people
  add column if not exists email text,
  add column if not exists invite_email text,
  add column if not exists linked_user_id uuid,
  add column if not exists account_status text default 'managed_by_household',
  add column if not exists income_visible_to_household boolean default true,
  add column if not exists costs_visible_to_household boolean default true,
  add column if not exists household_can_add_costs boolean default true,
  add column if not exists maturity_date date,
  add column if not exists avatar_url text,
  add column if not exists full_name text;

create table if not exists person_guardians (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  child_person_id uuid not null references people(id) on delete cascade,
  guardian_person_id uuid not null references people(id) on delete cascade,
  relationship_type text not null default 'parent_guardian',
  created_at timestamptz not null default now(),
  unique(child_person_id, guardian_person_id)
);

alter table person_guardians enable row level security;

drop policy if exists "Users manage their own person guardians" on person_guardians;
create policy "Users manage their own person guardians"
on person_guardians
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create table if not exists pay_event_monthly_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pay_event_id uuid references pay_events(id) on delete cascade,
  person_id uuid references people(id) on delete cascade,
  month text not null,
  statutory_pay numeric(12,2) default 0,
  occupational_pay numeric(12,2) default 0,
  gross_pay numeric(12,2) generated always as (coalesce(statutory_pay,0) + coalesce(occupational_pay,0)) stored,
  net_pay_override numeric(12,2),
  source text default 'manual',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, pay_event_id, month)
);

alter table pay_event_monthly_overrides enable row level security;

drop policy if exists "Users manage their own pay overrides" on pay_event_monthly_overrides;
create policy "Users manage their own pay overrides"
on pay_event_monthly_overrides
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create index if not exists pay_event_monthly_overrides_user_month_idx
on pay_event_monthly_overrides(user_id, month);

alter table if exists pay_events
  add column if not exists pay_timing text default 'fixed_day',
  add column if not exists pay_day_of_month integer default 28,
  add column if not exists pay_adjustment text default 'previous_workday';

create table if not exists account_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references app_households(id) on delete cascade,
  person_id uuid references people(id) on delete cascade,
  email text not null,
  invite_role text default 'member',
  invite_status text default 'draft',
  invite_token_hash text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  accepted_at timestamptz
);

alter table account_invites enable row level security;

drop policy if exists "Users see invites they created" on account_invites;
create policy "Users see invites they created"
on account_invites
for all
using (auth.uid() = created_by)
with check (auth.uid() = created_by);

insert into storage.buckets (id, name, public)
values ('user-avatars', 'user-avatars', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('person-avatars', 'person-avatars', true)
on conflict (id) do nothing;

notify pgrst, 'reload schema';
