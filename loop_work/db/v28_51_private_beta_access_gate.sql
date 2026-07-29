-- v28.51 - Private beta access gate for insideloop.life
-- Safe to rerun. Stores access codes as HMAC/SHA-256 hashes only.

create extension if not exists pgcrypto;

create table if not exists public.private_beta_codes (
  id uuid primary key default gen_random_uuid(),
  label text not null default 'Private beta invite',
  code_hash text not null unique,
  code_hash_prefix text,
  max_uses integer not null default 1 check (max_uses > 0),
  used_count integer not null default 0 check (used_count >= 0),
  expires_at timestamptz,
  disabled_at timestamptz,
  last_used_at timestamptz,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.private_beta_codes
  add column if not exists code_hash_prefix text,
  add column if not exists notes text,
  add column if not exists created_by uuid,
  add column if not exists last_used_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

update public.private_beta_codes
set code_hash_prefix = left(code_hash, 12)
where code_hash_prefix is null;

create index if not exists private_beta_codes_hash_idx on public.private_beta_codes(code_hash);
create index if not exists private_beta_codes_active_idx on public.private_beta_codes(disabled_at, expires_at, created_at desc);

create table if not exists public.private_beta_redemptions (
  id uuid primary key default gen_random_uuid(),
  beta_code_id uuid references public.private_beta_codes(id) on delete set null,
  user_id uuid,
  email text,
  redemption_source text,
  host text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists private_beta_redemptions_code_idx on public.private_beta_redemptions(beta_code_id, created_at desc);
create index if not exists private_beta_redemptions_user_idx on public.private_beta_redemptions(user_id, created_at desc) where user_id is not null;

create table if not exists public.private_beta_user_access (
  user_id uuid primary key,
  email text,
  beta_code_id uuid references public.private_beta_codes(id) on delete set null,
  approved_source text not null default 'beta_gate',
  approved_at timestamptz not null default now(),
  revoked_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists private_beta_user_access_email_idx on public.private_beta_user_access(lower(email)) where email is not null;

alter table public.private_beta_codes enable row level security;
alter table public.private_beta_redemptions enable row level security;
alter table public.private_beta_user_access enable row level security;

-- No anon/authenticated RLS policies are added intentionally.
-- The app manages these tables only with a server-side Supabase service/secret key.


-- Older/partial databases may have these tables without the unique indexes that ON CONFLICT needs.
-- v28.52 also ships a repair migration; keep this inline so v28.51 is safer to rerun.
with ranked as (
  select ctid,
         row_number() over (partition by flag_key order by updated_at desc nulls last, created_at desc nulls last, ctid desc) as rn
  from public.app_beta_flags
  where flag_key is not null
)
delete from public.app_beta_flags f using ranked r where f.ctid = r.ctid and r.rn > 1;

with ranked as (
  select ctid,
         row_number() over (partition by setting_key order by updated_at desc nulls last, created_at desc nulls last, ctid desc) as rn
  from public.wealth_watch_settings
  where setting_key is not null
)
delete from public.wealth_watch_settings s using ranked r where s.ctid = r.ctid and r.rn > 1;

with ranked as (
  select ctid,
         row_number() over (partition by product_key, task_key order by updated_at desc nulls last, created_at desc nulls last, id desc nulls last) as rn
  from public.app_future_integration_tasks
  where product_key is not null and task_key is not null
)
delete from public.app_future_integration_tasks t using ranked r where t.ctid = r.ctid and r.rn > 1;

create unique index if not exists app_beta_flags_flag_key_uidx on public.app_beta_flags(flag_key);
create unique index if not exists wealth_watch_settings_setting_key_uidx on public.wealth_watch_settings(setting_key);
create unique index if not exists app_future_integration_tasks_product_task_uidx on public.app_future_integration_tasks(product_key, task_key);

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
    description = excluded.description;

insert into public.app_future_integration_tasks(product_key, task_key, section, title, description, priority, status, metadata)
values
  ('platform', 'private-beta-access-gate', 'security', 'Private beta access gate', 'Protect the product before login/sign-up with a password-style access code, server-side hash validation and HttpOnly cookie unlock.', 180, 'done', '{"release":"v28.51","domain":"insideloop.life"}'::jsonb),
  ('platform', 'private-beta-admin-codes', 'admin', 'Admin private beta invite codes', 'Admin can create, disable and delete hash-only private beta codes without storing the original code.', 181, 'done', '{"release":"v28.51"}'::jsonb),
  ('platform', 'supabase-localhost-production-beta', 'deployment', 'Supabase localhost and production beta support', 'Same Supabase project can be used from http://localhost:3000 and https://insideloop.life by configuring Supabase redirect URLs and matching env vars.', 182, 'done', '{"release":"v28.51"}'::jsonb)
on conflict (product_key, task_key) do update
set section = excluded.section,
    title = excluded.title,
    description = excluded.description,
    priority = excluded.priority,
    status = excluded.status,
    metadata = excluded.metadata,
    updated_at = now();

select pg_notify('pgrst', 'reload schema');
