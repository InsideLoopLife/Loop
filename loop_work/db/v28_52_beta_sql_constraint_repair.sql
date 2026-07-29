-- v28.52 - Private beta SQL repair / ON CONFLICT constraint hardening
-- Safe to rerun. Run this if Supabase logs show:
--   42P10 there is no unique or exclusion constraint matching the ON CONFLICT specification
-- after running v28_51_private_beta_access_gate.sql.

create extension if not exists pgcrypto;

-- Some Supabase projects created from SQL editor/local workflows do not have the CLI migration
-- tracking schema. Creating it avoids noisy Studio/CLI lookups and matches Supabase CLI shape.
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text primary key,
  statements text[],
  name text
);

-- Recreate the three lookup/checklist tables defensively for older partial databases.
create table if not exists public.app_beta_flags (
  flag_key text primary key,
  label text not null,
  description text,
  scope text not null default 'site',
  enabled boolean not null default false,
  rollout_percent numeric not null default 0,
  requires_admin_approval boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_beta_flags
  add column if not exists label text,
  add column if not exists description text,
  add column if not exists scope text not null default 'site',
  add column if not exists enabled boolean not null default false,
  add column if not exists rollout_percent numeric not null default 0,
  add column if not exists requires_admin_approval boolean not null default false,
  add column if not exists notes text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.wealth_watch_settings (
  setting_key text primary key,
  setting_value text not null,
  description text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.wealth_watch_settings
  add column if not exists setting_value text,
  add column if not exists description text,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.app_future_integration_tasks (
  id uuid primary key default gen_random_uuid(),
  product_key text not null,
  task_key text not null,
  title text not null,
  description text not null default '',
  section text not null default 'Setup',
  priority int not null default 100,
  status text not null default 'todo',
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_future_integration_tasks
  add column if not exists product_key text,
  add column if not exists task_key text,
  add column if not exists title text,
  add column if not exists description text not null default '',
  add column if not exists section text not null default 'Setup',
  add column if not exists priority int not null default 100,
  add column if not exists status text not null default 'todo',
  add column if not exists completed_at timestamptz,
  add column if not exists completed_by uuid references auth.users(id) on delete set null,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

-- Remove duplicate rows before adding conflict-target indexes. Keep the most recently updated row.
with ranked as (
  select ctid,
         row_number() over (
           partition by flag_key
           order by updated_at desc nulls last, created_at desc nulls last, ctid desc
         ) as rn
  from public.app_beta_flags
  where flag_key is not null
)
delete from public.app_beta_flags f
using ranked r
where f.ctid = r.ctid and r.rn > 1;

with ranked as (
  select ctid,
         row_number() over (
           partition by setting_key
           order by updated_at desc nulls last, created_at desc nulls last, ctid desc
         ) as rn
  from public.wealth_watch_settings
  where setting_key is not null
)
delete from public.wealth_watch_settings s
using ranked r
where s.ctid = r.ctid and r.rn > 1;

with ranked as (
  select ctid,
         row_number() over (
           partition by product_key, task_key
           order by updated_at desc nulls last, created_at desc nulls last, id desc nulls last
         ) as rn
  from public.app_future_integration_tasks
  where product_key is not null and task_key is not null
)
delete from public.app_future_integration_tasks t
using ranked r
where t.ctid = r.ctid and r.rn > 1;

-- These are the exact conflict targets used by v28.48-v28.51.
create unique index if not exists app_beta_flags_flag_key_uidx
  on public.app_beta_flags(flag_key);

create unique index if not exists wealth_watch_settings_setting_key_uidx
  on public.wealth_watch_settings(setting_key);

create unique index if not exists app_future_integration_tasks_product_task_uidx
  on public.app_future_integration_tasks(product_key, task_key);

alter table public.app_beta_flags enable row level security;
alter table public.wealth_watch_settings enable row level security;
alter table public.app_future_integration_tasks enable row level security;

-- Complete/retry the v28.51 seed data now that the conflict targets definitely exist.
insert into public.app_beta_flags(flag_key, label, description, scope, enabled, rollout_percent, requires_admin_approval, notes)
values
  ('private_beta_access_gate', 'Private beta access gate', 'Require a server-validated access code before login/sign-up. Codes are never stored in plain text.', 'site', true, 100, false, 'Use LOOP_BETA_GATE_ENABLED=true, LOOP_BETA_CODE_PEPPER and LOOP_BETA_COOKIE_SECRET in production.'),
  ('site_beta_enabled', 'Whole site beta mode', 'Marks the whole product as beta and allows beta-only UI copy/features.', 'site', true, 100, false, 'InsideLoop private beta for insideloop.life.')
on conflict (flag_key) do update
set label = excluded.label,
    description = excluded.description,
    scope = excluded.scope,
    enabled = excluded.enabled,
    rollout_percent = excluded.rollout_percent,
    requires_admin_approval = excluded.requires_admin_approval,
    notes = excluded.notes,
    updated_at = now();

insert into public.wealth_watch_settings(setting_key, setting_value, description)
values
  ('private_beta_domain', 'https://insideloop.life', 'Production private beta domain.'),
  ('private_beta_localhost', 'http://localhost:3000', 'Local private beta domain for development against the same Supabase project.'),
  ('private_beta_code_storage', 'hash_only', 'Access codes are HMAC hashed server-side with LOOP_BETA_CODE_PEPPER. The plain code is not stored.'),
  ('private_beta_gate_mode', 'before_login', 'Access gate sits before login/sign-up and never sends the code to Supabase Auth or third-party analytics.')
on conflict (setting_key) do update
set setting_value = excluded.setting_value,
    description = excluded.description,
    updated_at = now();

insert into public.app_future_integration_tasks(product_key, task_key, section, title, description, priority, status, metadata)
values
  ('platform', 'private-beta-access-gate', 'security', 'Private beta access gate', 'Protect the product before login/sign-up with a password-style access code, server-side hash validation and HttpOnly cookie unlock.', 180, 'done', '{"release":"v28.51","domain":"insideloop.life","repaired_by":"v28.52"}'::jsonb),
  ('platform', 'private-beta-admin-codes', 'admin', 'Admin private beta invite codes', 'Admin can create, disable and delete hash-only private beta codes without storing the original code.', 181, 'done', '{"release":"v28.51","repaired_by":"v28.52"}'::jsonb),
  ('platform', 'supabase-localhost-production-beta', 'deployment', 'Supabase localhost and production beta support', 'Same Supabase project can be used from http://localhost:3000 and https://insideloop.life by configuring Supabase redirect URLs and matching env vars.', 182, 'done', '{"release":"v28.51","repaired_by":"v28.52"}'::jsonb)
on conflict (product_key, task_key) do update
set section = excluded.section,
    title = excluded.title,
    description = excluded.description,
    priority = excluded.priority,
    status = excluded.status,
    metadata = coalesce(public.app_future_integration_tasks.metadata, '{}'::jsonb) || excluded.metadata,
    updated_at = now();

select pg_notify('pgrst', 'reload schema');
