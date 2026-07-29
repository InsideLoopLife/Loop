-- Life Tracker V22 account, admin and notifications migration
-- Adds account/security preferences, creator-only admin support, in-app notifications,
-- email digest templates/runs and security event logging.

create extension if not exists pgcrypto;

create table if not exists app_migration_registry (
  id uuid primary key default gen_random_uuid(),
  migration_key text not null unique,
  migration_name text not null,
  applied_at timestamptz not null default now(),
  notes text
);

insert into app_migration_registry (migration_key, migration_name, notes)
values ('20260614_v22_account_admin_notifications', 'V22 account, admin and notifications', 'Adds MFA/password-reset support tables, notification preferences, admin email templates and digest run logs.')
on conflict (migration_key) do nothing;

create table if not exists app_user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  household_id uuid references app_households(id) on delete set null,
  display_name text,
  email text,
  timezone text not null default 'Europe/London',
  currency text not null default 'GBP',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app_admin_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'creator' check (role in ('creator','admin','support','readonly')),
  status text not null default 'active' check (status in ('active','disabled')),
  created_at timestamptz not null default now(),
  unique (email)
);

create or replace function app_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from app_admin_users a
    where a.status = 'active'
      and (
        a.user_id = auth.uid()
        or lower(a.email) = lower(coalesce(auth.email(), ''))
      )
  )
$$;

create table if not exists app_notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid references app_households(id) on delete set null,
  finance_digest_enabled boolean not null default true,
  health_digest_enabled boolean not null default true,
  renewal_reminders_enabled boolean not null default true,
  weekly_email_enabled boolean not null default true,
  monthly_email_enabled boolean not null default true,
  in_app_enabled boolean not null default true,
  push_notifications_enabled boolean not null default false,
  preferred_send_day text not null default 'Monday',
  preferred_send_time time not null default '08:00',
  quiet_hours_start time default '21:00',
  quiet_hours_end time default '07:00',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists app_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid references app_households(id) on delete set null,
  notification_type text not null default 'insight',
  channel text not null default 'in_app' check (channel in ('in_app','email','push','system')),
  status text not null default 'unread' check (status in ('queued','unread','read','dismissed','sent','failed')),
  severity text not null default 'info' check (severity in ('info','success','warning','urgent')),
  title text not null,
  body text,
  cta_label text,
  cta_href text,
  data jsonb not null default '{}'::jsonb,
  scheduled_for timestamptz,
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists app_email_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null unique,
  name text not null,
  category text not null default 'finance' check (category in ('finance','health','platform','security','household')),
  cadence text not null default 'weekly' check (cadence in ('weekly','monthly','event','manual')),
  subject text not null,
  preheader text,
  body_markdown text not null,
  enabled boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app_email_runs (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references app_email_templates(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  household_id uuid references app_households(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  run_type text not null default 'preview' check (run_type in ('preview','test','scheduled','manual')),
  status text not null default 'created' check (status in ('created','queued','sent','failed','cancelled')),
  subject text,
  preview_body text,
  send_to_email_hash text,
  scheduled_for timestamptz,
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists app_security_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  household_id uuid references app_households(id) on delete set null,
  event_type text not null,
  status text not null default 'info' check (status in ('info','success','warning','error')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table app_user_profiles enable row level security;
alter table app_admin_users enable row level security;
alter table app_notification_preferences enable row level security;
alter table app_notifications enable row level security;
alter table app_email_templates enable row level security;
alter table app_email_runs enable row level security;
alter table app_security_events enable row level security;

-- Profiles and preferences: private to the current user.
drop policy if exists "profiles_own" on app_user_profiles;
create policy "profiles_own" on app_user_profiles
for all using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "admin_users_read_self_or_admin" on app_admin_users;
create policy "admin_users_read_self_or_admin" on app_admin_users
for select using (
  lower(email) = lower(coalesce((select auth.email()), ''))
  or user_id = (select auth.uid())
  or app_is_admin()
);

-- Admin membership should be inserted manually by the project owner or via service-role tools, not public client code.
drop policy if exists "admin_users_no_public_insert" on app_admin_users;
create policy "admin_users_no_public_insert" on app_admin_users
for insert with check (false);

drop policy if exists "admin_users_admin_update" on app_admin_users;
create policy "admin_users_admin_update" on app_admin_users
for update using (app_is_admin())
with check (app_is_admin());

drop policy if exists "notification_preferences_own" on app_notification_preferences;
create policy "notification_preferences_own" on app_notification_preferences
for all using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "notifications_own" on app_notifications;
create policy "notifications_own" on app_notifications
for all using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

-- Admin users can manage templates; normal users don't need direct template access.
drop policy if exists "email_templates_admin_manage" on app_email_templates;
create policy "email_templates_admin_manage" on app_email_templates
for all using (app_is_admin())
with check (app_is_admin());

drop policy if exists "email_runs_user_or_admin" on app_email_runs;
create policy "email_runs_user_or_admin" on app_email_runs
for select using (user_id = (select auth.uid()) or app_is_admin());

drop policy if exists "email_runs_admin_insert" on app_email_runs;
create policy "email_runs_admin_insert" on app_email_runs
for insert with check (created_by = (select auth.uid()) or app_is_admin());

drop policy if exists "security_events_own_or_admin" on app_security_events;
create policy "security_events_own_or_admin" on app_security_events
for select using (user_id = (select auth.uid()) or app_is_admin());

drop policy if exists "security_events_own_insert" on app_security_events;
create policy "security_events_own_insert" on app_security_events
for insert with check (user_id = (select auth.uid()) or app_is_admin());

create index if not exists app_notifications_user_status_idx on app_notifications(user_id, status, created_at desc);
create index if not exists app_notifications_household_idx on app_notifications(household_id, created_at desc);
create index if not exists app_email_runs_user_idx on app_email_runs(user_id, created_at desc);
create index if not exists app_security_events_user_idx on app_security_events(user_id, created_at desc);

insert into app_email_templates (template_key, name, category, cadence, subject, preheader, body_markdown, enabled)
values
  (
    'weekly_household_money_digest',
    'Weekly household money digest',
    'finance',
    'weekly',
    'Your household money update for {{period_label}}',
    'Income, spending, renewals and savings nudges for the week ahead.',
    'Hi {{first_name}},\n\nHere is your household money check-in for {{period_label}}.\n\n## This month\n- Expected income: {{monthly_income}}\n- Expected outgoings: {{monthly_outgoings}}\n- Expected buffer: {{monthly_buffer}}\n\n## Useful nudges\n{{finance_nudges}}\n\n## Coming up\n{{renewal_nudges}}\n\nKeep going — this is about progress, not perfection.',
    true
  ),
  (
    'monthly_savings_forecast',
    'Monthly savings forecast',
    'finance',
    'monthly',
    'Your savings forecast for {{period_label}}',
    'A monthly view of forecast savings, mortgage movement and net-worth changes.',
    'Hi {{first_name}},\n\nYour forecast for {{period_label}} is ready.\n\n- Forecast surplus: {{monthly_buffer}}\n- Suggested savings action: {{savings_action}}\n- Mortgage/equity note: {{mortgage_note}}\n\nYou can adjust any assumptions in the app.',
    true
  ),
  (
    'weekly_health_food_digest',
    'Weekly health and food digest',
    'health',
    'weekly',
    'Your food and health planning update for {{period_label}}',
    'Meal ideas, shopping reminders and simple macro/micro nudges.',
    'Hi {{first_name}},\n\nHere is your food and lifestyle check-in for {{period_label}}.\n\n## Meal planning\n{{meal_nudges}}\n\n## Shopping\n{{shopping_nudges}}\n\n## Health tracker\n{{health_nudges}}\n\nSmall consistent choices add up.',
    true
  )
on conflict (template_key) do update set
  name = excluded.name,
  category = excluded.category,
  cadence = excluded.cadence,
  subject = excluded.subject,
  preheader = excluded.preheader,
  body_markdown = excluded.body_markdown,
  enabled = excluded.enabled,
  updated_at = now();

notify pgrst, 'reload schema';
