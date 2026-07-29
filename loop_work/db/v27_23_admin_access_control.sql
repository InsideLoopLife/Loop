-- Life Tracker V27.23 admin access control and developer dashboard guardrail
-- Restricts admin bootstrap to help@gamingnectar.com by default and records the admin row.

create extension if not exists pgcrypto;

create table if not exists app_migration_registry (
  id uuid primary key default gen_random_uuid(),
  migration_key text not null unique,
  migration_name text not null,
  applied_at timestamptz not null default now(),
  notes text
);

insert into app_migration_registry (migration_key, migration_name, notes)
values (
  '20260618_v27_23_admin_access_control',
  'V27.23 admin access control',
  'Adds explicit admin allow-list seed for help@gamingnectar.com and supports the /admin system health dashboard.'
)
on conflict (migration_key) do nothing;

create table if not exists app_admin_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'creator' check (role in ('creator','admin','support','readonly')),
  status text not null default 'active' check (status in ('active','disabled')),
  created_at timestamptz not null default now(),
  unique (email)
);

insert into app_admin_users (email, role, status)
values ('help@gamingnectar.com', 'creator', 'active')
on conflict (email) do update set role = excluded.role, status = excluded.status;

alter table app_admin_users enable row level security;

drop policy if exists "admin_users_read_self_or_admin" on app_admin_users;
create policy "admin_users_read_self_or_admin" on app_admin_users
for select using (
  lower(email) = lower(coalesce((select auth.email()), ''))
  or user_id = (select auth.uid())
  or exists (
    select 1 from app_admin_users a
    where a.status = 'active'
      and lower(a.email) = lower(coalesce((select auth.email()), ''))
  )
);
