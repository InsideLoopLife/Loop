-- Inside LOOP Stage 2 core tables
-- Run this first in Supabase SQL Editor.
-- Review table names if your app already has equivalents.

create extension if not exists pgcrypto;

create schema if not exists security;
create schema if not exists private;

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value)
values
  ('site', jsonb_build_object(
    'domain', 'https://insideloop.life',
    'mode', 'closed_beta',
    'public_signups_enabled', false,
    'beta_access_required', true
  )),
  ('emails', jsonb_build_object(
    'primary', 'dan@insideloop.life',
    'notifications', 'notifications@insideloop.life',
    'help', 'help@insideloop.life',
    'customer_service', 'cs@insideloop.life',
    'privacy', 'privacy@insideloop.life'
  ))
on conflict (key) do update
set value = excluded.value,
    updated_at = now();

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  role text not null default 'user' check (role in ('user', 'beta_tester', 'support', 'admin', 'owner')),
  beta_access_code_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid,
  actor_email text,
  action text not null,
  target_type text,
  target_id text,
  before_value jsonb,
  after_value jsonb,
  ip_hash text,
  user_agent_hash text,
  created_at timestamptz not null default now()
);

create table if not exists public.beta_access_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  label text,
  intended_email text,
  status text not null default 'active' check (status in ('active', 'paused', 'revoked', 'expired')),
  max_uses int not null default 1 check (max_uses > 0),
  used_count int not null default 0 check (used_count >= 0),
  expires_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists beta_access_codes_status_idx
on public.beta_access_codes(status, expires_at);

create table if not exists public.beta_access_code_redemptions (
  id uuid primary key default gen_random_uuid(),
  code_id uuid not null references public.beta_access_codes(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  email text,
  ip_hash text,
  user_agent_hash text,
  created_at timestamptz not null default now()
);

create index if not exists beta_access_code_redemptions_code_idx
on public.beta_access_code_redemptions(code_id, created_at desc);

create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  email text,
  status text not null default 'requested' check (status in ('requested', 'purging', 'purged', 'failed')),
  confirmation_text text,
  requested_at timestamptz not null default now(),
  purged_at timestamptz,
  purge_summary jsonb not null default '{}'::jsonb,
  error text
);

alter table public.app_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.admin_audit_log enable row level security;
alter table public.beta_access_codes enable row level security;
alter table public.beta_access_code_redemptions enable row level security;
alter table public.account_deletion_requests enable row level security;

alter table public.app_settings force row level security;
alter table public.profiles force row level security;
alter table public.admin_audit_log force row level security;
alter table public.beta_access_codes force row level security;
alter table public.beta_access_code_redemptions force row level security;
alter table public.account_deletion_requests force row level security;

drop policy if exists "loop_profiles_select_self" on public.profiles;
create policy "loop_profiles_select_self"
on public.profiles for select
to authenticated
using ((select auth.uid()) is not null and id = (select auth.uid()));

drop policy if exists "loop_profiles_update_self" on public.profiles;
create policy "loop_profiles_update_self"
on public.profiles for update
to authenticated
using ((select auth.uid()) is not null and id = (select auth.uid()))
with check ((select auth.uid()) is not null and id = (select auth.uid()));

create or replace function public.loop_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
begin
  insert into public.profiles (id, email, display_name, role, created_at, updated_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_app_meta_data->>'role', 'beta_tester'),
    now(),
    now()
  )
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists loop_on_auth_user_created on auth.users;
create trigger loop_on_auth_user_created
after insert on auth.users
for each row execute procedure public.loop_handle_new_user();
