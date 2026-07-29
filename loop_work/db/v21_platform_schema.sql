-- Life Tracker V21 platform-core migration
-- Adds household tenancy scaffolding, audit logging, export jobs, production checks,
-- and a formal migration registry for moving from local prototype to hosted private app.

create extension if not exists pgcrypto;

-- Tracks which SQL hardening migrations have been applied. This is deliberately simple
-- so it can coexist with Supabase CLI migrations later.
create table if not exists app_migration_registry (
  id uuid primary key default gen_random_uuid(),
  migration_key text not null unique,
  migration_name text not null,
  applied_at timestamptz not null default now(),
  notes text
);

insert into app_migration_registry (migration_key, migration_name, notes)
values ('20260613_v21_platform_core', 'V21 platform core, audit and privacy hardening', 'Adds household tenancy, audit logs, exports and production readiness support.')
on conflict (migration_key) do nothing;

-- Household-level tenancy scaffold. Existing tables still work through user_id, but the app
-- now has a clean household layer for future shared access.
create table if not exists app_households (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'My household',
  timezone text not null default 'Europe/London',
  currency text not null default 'GBP',
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app_household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references app_households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','admin','member','viewer')),
  status text not null default 'active' check (status in ('active','invited','removed')),
  created_at timestamptz not null default now(),
  unique (household_id, user_id)
);

create table if not exists app_invitations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references app_households(id) on delete cascade,
  invited_email text not null,
  invited_by uuid not null references auth.users(id) on delete cascade,
  invite_code_hash text not null,
  role text not null default 'member' check (role in ('admin','member','viewer')),
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

-- Minimal, privacy-preserving audit log. We store table names, record ids, changed columns and hashes,
-- not full sensitive values.
create table if not exists app_audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  household_id uuid references app_households(id) on delete set null,
  table_name text not null,
  record_id text,
  action text not null check (action in ('INSERT','UPDATE','DELETE','SYSTEM')),
  changed_columns text[] not null default '{}',
  old_hash text,
  new_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists app_export_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid references app_households(id) on delete set null,
  export_type text not null default 'full_json' check (export_type in ('full_json','financial_csv','audit_csv')),
  status text not null default 'requested' check (status in ('requested','running','completed','failed','expired')),
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days'),
  file_path text,
  notes text
);

create table if not exists app_platform_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid references app_households(id) on delete set null,
  note_type text not null default 'readiness',
  title text not null,
  body text,
  status text not null default 'open' check (status in ('open','done','ignored')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table app_households enable row level security;
alter table app_household_members enable row level security;
alter table app_invitations enable row level security;
alter table app_audit_log enable row level security;
alter table app_export_jobs enable row level security;
alter table app_platform_notes enable row level security;

-- Households: owner can manage their household; active members can read the household.
drop policy if exists "households_select_member" on app_households;
create policy "households_select_member" on app_households
for select using (
  owner_user_id = (select auth.uid())
  or exists (
    select 1 from app_household_members m
    where m.household_id = app_households.id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  )
);

drop policy if exists "households_insert_owner" on app_households;
create policy "households_insert_owner" on app_households
for insert with check (owner_user_id = (select auth.uid()));

drop policy if exists "households_update_owner" on app_households;
create policy "households_update_owner" on app_households
for update using (owner_user_id = (select auth.uid()))
with check (owner_user_id = (select auth.uid()));

-- Members: users can see their memberships; owners can see/manage their household memberships.
drop policy if exists "members_select_self_or_owner" on app_household_members;
create policy "members_select_self_or_owner" on app_household_members
for select using (
  user_id = (select auth.uid())
  or exists (
    select 1 from app_households h
    where h.id = app_household_members.household_id
      and h.owner_user_id = (select auth.uid())
  )
);

drop policy if exists "members_insert_self" on app_household_members;
create policy "members_insert_self" on app_household_members
for insert with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from app_households h
    where h.id = app_household_members.household_id
      and h.owner_user_id = (select auth.uid())
  )
);

drop policy if exists "members_update_owner" on app_household_members;
create policy "members_update_owner" on app_household_members
for update using (
  exists (
    select 1 from app_households h
    where h.id = app_household_members.household_id
      and h.owner_user_id = (select auth.uid())
  )
);

-- Invitations: owner/admin only.
drop policy if exists "invitations_owner_manage" on app_invitations;
create policy "invitations_owner_manage" on app_invitations
for all using (
  exists (
    select 1 from app_households h
    where h.id = app_invitations.household_id
      and h.owner_user_id = (select auth.uid())
  )
)
with check (
  invited_by = (select auth.uid())
  and exists (
    select 1 from app_households h
    where h.id = app_invitations.household_id
      and h.owner_user_id = (select auth.uid())
  )
);

-- Audit logs: visible to the acting user and household owner. Inserts are allowed for the authenticated
-- user and DB triggers; never expose cross-user audit rows.
drop policy if exists "audit_select_own_or_household_owner" on app_audit_log;
create policy "audit_select_own_or_household_owner" on app_audit_log
for select using (
  user_id = (select auth.uid())
  or exists (
    select 1 from app_households h
    where h.id = app_audit_log.household_id
      and h.owner_user_id = (select auth.uid())
  )
);

drop policy if exists "audit_insert_self" on app_audit_log;
create policy "audit_insert_self" on app_audit_log
for insert with check (user_id = (select auth.uid()));

-- Exports/notes: private per user, optionally household-linked.
drop policy if exists "exports_own" on app_export_jobs;
create policy "exports_own" on app_export_jobs
for all using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "platform_notes_own" on app_platform_notes;
create policy "platform_notes_own" on app_platform_notes
for all using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

-- Household helper.
create or replace function app_default_household_id()
returns uuid
language sql
stable
security invoker
as $$
  select m.household_id
  from app_household_members m
  where m.user_id = auth.uid()
    and m.status = 'active'
  order by m.created_at asc
  limit 1
$$;

-- Add household_id to existing user-owned tables where practical. Code remains backwards-compatible
-- because all columns are nullable during the refactor.
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'financial_profiles','income_entries','spending_categories','spending_entries','mortgage_scenarios',
    'assets','liabilities','accounts','account_balance_snapshots','household_people','pay_events',
    'child_costs','planned_items','bank_imports','bank_transactions','regular_payment_candidates',
    'homes','home_owners','home_valuation_sources','mortgages','affordability_searches',
    'integration_connections','integration_secrets','statutory_rate_assumptions','user_assumptions',
    'assumption_check_log','pension_accounts','pension_funds','investment_accounts','investment_holdings',
    'pension_fund_research_notes','lifestyle_bills','food_supermarkets','food_meals'
  ]
  loop
    if to_regclass('public.' || tbl) is not null then
      execute format('alter table %I add column if not exists household_id uuid references app_households(id) on delete set null', tbl);
      execute format('create index if not exists %I on %I(household_id)', tbl || '_household_idx', tbl);
    end if;
  end loop;
end $$;

-- Privacy-preserving audit trigger.
create or replace function app_audit_row_change()
returns trigger
language plpgsql
security invoker
as $$
declare
  old_row jsonb := null;
  new_row jsonb := null;
  acting_user uuid := auth.uid();
  row_user uuid := null;
  row_household uuid := null;
  record_identifier text := null;
  changed text[] := '{}';
  key text;
begin
  if tg_op <> 'INSERT' then
    old_row := to_jsonb(old);
  end if;
  if tg_op <> 'DELETE' then
    new_row := to_jsonb(new);
  end if;

  row_user := nullif(coalesce(new_row->>'user_id', old_row->>'user_id', acting_user::text), '')::uuid;
  row_household := nullif(coalesce(new_row->>'household_id', old_row->>'household_id'), '')::uuid;
  record_identifier := coalesce(new_row->>'id', old_row->>'id');

  if tg_op = 'UPDATE' then
    for key in select jsonb_object_keys(coalesce(new_row, '{}'::jsonb) || coalesce(old_row, '{}'::jsonb)) loop
      if coalesce(new_row->key, 'null'::jsonb) is distinct from coalesce(old_row->key, 'null'::jsonb) then
        changed := array_append(changed, key);
      end if;
    end loop;
  elsif tg_op = 'INSERT' then
    changed := array(select jsonb_object_keys(coalesce(new_row, '{}'::jsonb)));
  elsif tg_op = 'DELETE' then
    changed := array(select jsonb_object_keys(coalesce(old_row, '{}'::jsonb)));
  end if;

  insert into app_audit_log (
    user_id,
    household_id,
    table_name,
    record_id,
    action,
    changed_columns,
    old_hash,
    new_hash,
    metadata
  ) values (
    row_user,
    row_household,
    tg_table_name,
    record_identifier,
    tg_op,
    coalesce(changed, '{}'),
    case when old_row is null then null else encode(digest(old_row::text, 'sha256'), 'hex') end,
    case when new_row is null then null else encode(digest(new_row::text, 'sha256'), 'hex') end,
    jsonb_build_object('schema', tg_table_schema)
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
exception
  when others then
    -- Audit must never break the user action.
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
end;
$$;

-- Attach audit trigger to sensitive tables if they exist.
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'financial_profiles','income_entries','spending_entries','planned_items','bank_imports','bank_transactions',
    'regular_payment_candidates','household_people','pay_events','child_costs','homes','home_valuation_sources',
    'mortgages','affordability_searches','assets','liabilities','accounts','account_balance_snapshots',
    'pension_accounts','pension_funds','investment_accounts','investment_holdings','integration_connections',
    'integration_secrets','statutory_rate_assumptions','user_assumptions','lifestyle_bills','food_meals'
  ]
  loop
    if to_regclass('public.' || tbl) is not null then
      execute format('drop trigger if exists app_audit_%I on %I', tbl, tbl);
      execute format('create trigger app_audit_%I after insert or update or delete on %I for each row execute function app_audit_row_change()', tbl, tbl);
    end if;
  end loop;
end $$;

create index if not exists app_audit_log_user_created_idx on app_audit_log(user_id, created_at desc);
create index if not exists app_audit_log_household_created_idx on app_audit_log(household_id, created_at desc);
create index if not exists app_export_jobs_user_created_idx on app_export_jobs(user_id, requested_at desc);
create index if not exists app_household_members_user_idx on app_household_members(user_id, status);

select pg_notify('pgrst', 'reload schema');
