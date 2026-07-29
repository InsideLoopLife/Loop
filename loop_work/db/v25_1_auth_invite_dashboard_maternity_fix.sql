-- v25_1_auth_invite_dashboard_maternity_fix.sql
-- Idempotent patch for branded code auth, invite auto-linking, household-visible dashboard reads and NHS maternity mode defaults.

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

create table if not exists person_account_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid,
  person_id uuid not null references people(id) on delete cascade,
  invited_by_user_id uuid,
  email text not null,
  relationship text,
  token_hash text not null unique,
  status text not null default 'pending',
  expires_at timestamptz,
  accepted_user_id uuid,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

alter table person_account_invites add column if not exists household_id uuid;
alter table person_account_invites add column if not exists invited_by_user_id uuid;
alter table person_account_invites add column if not exists relationship text;
alter table person_account_invites add column if not exists accepted_user_id uuid;
alter table person_account_invites add column if not exists accepted_at timestamptz;
create index if not exists person_account_invites_email_status_idx on person_account_invites (email, status, expires_at);

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

create index if not exists household_join_invites_email_status_idx on household_join_invites (invited_email, status, expires_at);
create index if not exists household_join_invites_hash_status_idx on household_join_invites (invited_email_hash, status, expires_at);

alter table people add column if not exists linked_user_id uuid;
alter table people add column if not exists email text;
alter table people add column if not exists invite_email text;
alter table people add column if not exists account_status text default 'managed_by_household';
alter table people add column if not exists income_visible_to_household boolean not null default true;
alter table people add column if not exists costs_visible_to_household boolean not null default true;
alter table people add column if not exists household_can_add_costs boolean not null default true;
alter table people add column if not exists maturity_date date;

alter table pay_events add column if not exists maternity_pay_mode text;
alter table pay_events add column if not exists maternity_leave_start date;
alter table pay_events add column if not exists maternity_leave_end date;
alter table pay_events add column if not exists maternity_full_pay_weeks numeric;
alter table pay_events add column if not exists maternity_half_pay_weeks numeric;
alter table pay_events add column if not exists maternity_smp_only_weeks numeric;
alter table pay_events add column if not exists maternity_unpaid_weeks numeric;
alter table pay_events add column if not exists maternity_smp_weekly_rate numeric;
alter table pay_events add column if not exists pay_timing text default 'fixed_day';
alter table pay_events add column if not exists pay_day_of_month integer default 28;
alter table pay_events add column if not exists pay_adjustment text default 'previous_workday';

update pay_events
set maternity_pay_mode = 'nhs_spread_occupational_actual_smp'
where pay_kind = 'maternity'
  and (maternity_pay_mode is null or maternity_pay_mode = '' or maternity_pay_mode = 'spread_equal');

-- Ensure app notifications can receive invite/link messages.
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

-- Helper indexes for household context.
create index if not exists app_household_members_user_status_idx on app_household_members(user_id, status);
create index if not exists people_email_idx on people(email);
create index if not exists people_invite_email_idx on people(invite_email);
