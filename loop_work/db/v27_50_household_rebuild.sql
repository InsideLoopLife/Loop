-- v27.50: Full household rebuild / invite RPC reset
-- Purpose:
-- 1) Fix "cannot change return type" by dropping old household RPCs first.
-- 2) Remove the need for a Supabase service-role key in local household create/invite/join flows.
-- 3) Make invite tokens URL-safe and accept by long token, short code or invite id.
-- 4) Add RPCs for member role changes, removals, leaving households and person-invite claiming.
-- 5) Add a verification report you can run after migrating.

-- Supabase can install pgcrypto either in public or extensions schema depending on project setup.
-- The helper below prevents "function digest(text, unknown) does not exist" failures.
create schema if not exists extensions;
do $$
begin
  begin
    create extension if not exists pgcrypto with schema extensions;
  exception when duplicate_object then
    null;
  end;
end $$;

create or replace function public.app_sha256(p_value text)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
immutable
as $$
declare
  v_result text;
begin
  begin
    execute 'select encode(extensions.digest($1::text, $2::text), $3::text)'
      using coalesce(p_value, ''), 'sha256', 'hex'
      into v_result;
    return v_result;
  exception when undefined_function or invalid_schema_name then
    null;
  end;

  begin
    execute 'select encode(public.digest($1::text, $2::text), $3::text)'
      using coalesce(p_value, ''), 'sha256', 'hex'
      into v_result;
    return v_result;
  exception when undefined_function or invalid_schema_name then
    raise exception 'pgcrypto digest() is required. Enable pgcrypto in Supabase Database > Extensions, then rerun this migration.';
  end;
end;
$$;


-- ---------------------------------------------------------------------------
-- 0. Schema hardening / columns
-- ---------------------------------------------------------------------------

alter table if exists app_households
  add column if not exists name text default 'My household',
  add column if not exists timezone text default 'Europe/London',
  add column if not exists currency text default 'GBP',
  add column if not exists image_url text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table if exists app_household_members
  add column if not exists email text,
  add column if not exists role text default 'member',
  add column if not exists permission_tier text default 'member',
  add column if not exists status text default 'active',
  add column if not exists can_manage_people boolean not null default false,
  add column if not exists can_manage_child_profiles boolean not null default false,
  add column if not exists can_view_household_income boolean not null default false,
  add column if not exists can_manage_household_costs boolean not null default false,
  add column if not exists can_manage_integrations boolean not null default false,
  add column if not exists removed_at timestamptz,
  add column if not exists removed_by_user_id uuid,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table if exists people
  add column if not exists email text,
  add column if not exists invite_email text,
  add column if not exists linked_user_id uuid references auth.users(id) on delete set null,
  add column if not exists account_status text default 'managed_by_household',
  add column if not exists income_visible_to_household boolean default true,
  add column if not exists costs_visible_to_household boolean default true,
  add column if not exists household_can_add_costs boolean default true,
  add column if not exists avatar_url text,
  add column if not exists updated_at timestamptz default now();

create table if not exists household_join_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references app_households(id) on delete cascade,
  invited_by_user_id uuid references auth.users(id) on delete set null,
  invited_email text,
  invited_email_hash text,
  token_hash text not null unique,
  short_code text not null unique,
  role text not null default 'member',
  permission_tier text not null default 'member',
  status text not null default 'pending',
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_user_id uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists household_join_invites
  add column if not exists invited_email_hash text,
  add column if not exists accepted_user_id uuid references auth.users(id) on delete set null,
  add column if not exists accepted_at timestamptz,
  add column if not exists updated_at timestamptz default now();



create table if not exists person_account_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references app_households(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  invited_by_user_id uuid references auth.users(id) on delete set null,
  email text not null,
  relationship text,
  token_hash text not null unique,
  status text not null default 'pending',
  expires_at timestamptz,
  accepted_at timestamptz,
  accepted_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists person_account_invites
  add column if not exists household_id uuid,
  add column if not exists person_id uuid,
  add column if not exists invited_by_user_id uuid,
  add column if not exists email text,
  add column if not exists relationship text,
  add column if not exists token_hash text,
  add column if not exists status text default 'pending',
  add column if not exists expires_at timestamptz,
  add column if not exists accepted_at timestamptz,
  add column if not exists accepted_user_id uuid,
  add column if not exists updated_at timestamptz default now();

create index if not exists person_account_invites_token_hash_idx on person_account_invites(token_hash);
create index if not exists person_account_invites_email_status_idx on person_account_invites(email, status, expires_at);
create index if not exists person_account_invites_household_idx on person_account_invites(household_id);

create unique index if not exists app_household_members_household_user_uidx on app_household_members(household_id, user_id);
create index if not exists app_household_members_user_status_idx on app_household_members(user_id, status);
create index if not exists app_household_members_household_status_idx on app_household_members(household_id, status);
create index if not exists household_join_invites_token_hash_idx on household_join_invites(token_hash);
create index if not exists household_join_invites_short_code_idx on household_join_invites(short_code);
create index if not exists household_join_invites_email_status_idx on household_join_invites(invited_email, status, expires_at);
create index if not exists household_join_invites_hash_status_idx on household_join_invites(invited_email_hash, status, expires_at);

-- Make old CHECK constraints compatible with the role model.
do $$
begin
  alter table app_household_members drop constraint if exists app_household_members_role_check;
  alter table app_household_members drop constraint if exists app_household_members_status_check;
exception when undefined_table then null;
end $$;

alter table if exists app_household_members
  add constraint app_household_members_role_check
  check (role in ('owner','admin','parent','parent_admin','member','viewer','child')) not valid;

alter table if exists app_household_members
  add constraint app_household_members_status_check
  check (status in ('active','invited','pending','removed','left')) not valid;

-- ---------------------------------------------------------------------------
-- 1. Drop old functions first to avoid PostgreSQL return-type errors.
-- ---------------------------------------------------------------------------

drop function if exists public.app_accept_household_invite(text, uuid);
drop function if exists public.app_accept_household_invite(text);
drop function if exists public.app_accept_household_invite(uuid);
drop function if exists public.app_create_household_invite(uuid, text, text, text, int, text);
drop function if exists public.app_household_invite_preview(text, uuid);
drop function if exists public.app_get_or_create_household(text, text, text, text);
drop function if exists public.app_accept_person_invite(text, uuid);
drop function if exists public.app_update_household_member_role(uuid, text, text);
drop function if exists public.app_remove_household_member(uuid);
drop function if exists public.app_leave_household(uuid);
drop function if exists public.app_household_healthcheck();

-- ---------------------------------------------------------------------------
-- 2. RLS-safe helper functions
-- ---------------------------------------------------------------------------

create or replace function public.loop_household_permission(h_id uuid)
returns table(
  is_member boolean,
  is_manager boolean,
  is_owner boolean,
  permission_tier text
)
language sql
security definer
set search_path = public
set row_security = off
stable
as $$
  select
    exists(
      select 1 from app_household_members m
      where m.household_id = h_id and m.user_id = auth.uid() and coalesce(m.status, 'active') = 'active'
    ) as is_member,
    exists(
      select 1 from app_household_members m
      where m.household_id = h_id and m.user_id = auth.uid() and coalesce(m.status, 'active') = 'active'
        and (coalesce(m.permission_tier, 'member') in ('owner','admin') or coalesce(m.can_manage_people, false) is true)
    ) as is_manager,
    exists(
      select 1 from app_household_members m
      where m.household_id = h_id and m.user_id = auth.uid() and coalesce(m.status, 'active') = 'active'
        and coalesce(m.permission_tier, 'member') = 'owner'
    ) as is_owner,
    coalesce((
      select m.permission_tier from app_household_members m
      where m.household_id = h_id and m.user_id = auth.uid() and coalesce(m.status, 'active') = 'active'
      order by m.created_at asc
      limit 1
    ), 'none') as permission_tier;
$$;

grant execute on function public.loop_household_permission(uuid) to authenticated;

create or replace function public.loop_is_household_member(h_id uuid)
returns boolean
language sql
security definer
set search_path = public
set row_security = off
stable
as $$
  select exists(
    select 1 from app_household_members m
    where m.household_id = h_id and m.user_id = auth.uid() and coalesce(m.status, 'active') = 'active'
  );
$$;

create or replace function public.loop_can_manage_household(h_id uuid)
returns boolean
language sql
security definer
set search_path = public
set row_security = off
stable
as $$
  select exists(
    select 1 from app_household_members m
    where m.household_id = h_id and m.user_id = auth.uid() and coalesce(m.status, 'active') = 'active'
      and (coalesce(m.permission_tier, 'member') in ('owner','admin') or coalesce(m.can_manage_people, false) is true)
  );
$$;

grant execute on function public.loop_is_household_member(uuid) to authenticated;
grant execute on function public.loop_can_manage_household(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. RLS policies: keep the browser safe while allowing household members to read shared household data.
-- ---------------------------------------------------------------------------

alter table if exists app_households enable row level security;
alter table if exists app_household_members enable row level security;
alter table if exists household_join_invites enable row level security;

-- app_households
DROP POLICY if exists app_households_select_member_v2750 on app_households;
DROP POLICY if exists app_households_update_manager_v2750 on app_households;
DROP POLICY if exists app_households_insert_self_v2750 on app_households;
DROP POLICY if exists app_households_owner_delete_v2750 on app_households;

create policy app_households_select_member_v2750 on app_households
for select to authenticated
using (owner_user_id = auth.uid() or public.loop_is_household_member(id));

create policy app_households_insert_self_v2750 on app_households
for insert to authenticated
with check (owner_user_id = auth.uid());

create policy app_households_update_manager_v2750 on app_households
for update to authenticated
using (owner_user_id = auth.uid() or public.loop_can_manage_household(id))
with check (owner_user_id = auth.uid() or public.loop_can_manage_household(id));

create policy app_households_owner_delete_v2750 on app_households
for delete to authenticated
using (owner_user_id = auth.uid());

-- app_household_members
DROP POLICY if exists app_household_members_select_member_v2750 on app_household_members;
DROP POLICY if exists app_household_members_insert_self_or_manager_v2750 on app_household_members;
DROP POLICY if exists app_household_members_update_manager_v2750 on app_household_members;
DROP POLICY if exists app_household_members_delete_owner_v2750 on app_household_members;

create policy app_household_members_select_member_v2750 on app_household_members
for select to authenticated
using (user_id = auth.uid() or public.loop_is_household_member(household_id));

create policy app_household_members_insert_self_or_manager_v2750 on app_household_members
for insert to authenticated
with check (user_id = auth.uid() or public.loop_can_manage_household(household_id));

create policy app_household_members_update_manager_v2750 on app_household_members
for update to authenticated
using (user_id = auth.uid() or public.loop_can_manage_household(household_id))
with check (user_id = auth.uid() or public.loop_can_manage_household(household_id));

create policy app_household_members_delete_owner_v2750 on app_household_members
for delete to authenticated
using (public.loop_can_manage_household(household_id));

-- household_join_invites
DROP POLICY if exists household_join_invites_select_manager_or_recipient_v2750 on household_join_invites;
DROP POLICY if exists household_join_invites_insert_manager_v2750 on household_join_invites;
DROP POLICY if exists household_join_invites_update_manager_v2750 on household_join_invites;

create policy household_join_invites_select_manager_or_recipient_v2750 on household_join_invites
for select to authenticated
using (
  public.loop_can_manage_household(household_id)
  or lower(coalesce(invited_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  or coalesce(invited_email_hash, '') = public.app_sha256(lower(coalesce(auth.jwt() ->> 'email', '')))
);

create policy household_join_invites_insert_manager_v2750 on household_join_invites
for insert to authenticated
with check (public.loop_can_manage_household(household_id));

create policy household_join_invites_update_manager_v2750 on household_join_invites
for update to authenticated
using (public.loop_can_manage_household(household_id) or accepted_user_id = auth.uid())
with check (public.loop_can_manage_household(household_id) or accepted_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4. Core household RPCs
-- ---------------------------------------------------------------------------

create function public.app_get_or_create_household(
  p_name text default 'My household',
  p_timezone text default 'Europe/London',
  p_currency text default 'GBP',
  p_image_url text default null
) returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_household_id uuid;
begin
  if v_user is null then raise exception 'Not signed in'; end if;

  select household_id into v_household_id
  from app_household_members
  where user_id = v_user and status = 'active'
  order by created_at asc
  limit 1;

  if v_household_id is null then
    select id into v_household_id from app_households where owner_user_id = v_user order by created_at asc limit 1;
  end if;

  if v_household_id is null then
    insert into app_households(owner_user_id, name, timezone, currency, image_url, created_at, updated_at)
    values (
      v_user,
      coalesce(nullif(trim(p_name), ''), 'My household'),
      coalesce(nullif(trim(p_timezone), ''), 'Europe/London'),
      coalesce(nullif(trim(p_currency), ''), 'GBP'),
      nullif(trim(coalesce(p_image_url, '')), ''),
      now(),
      now()
    ) returning id into v_household_id;
  else
    update app_households
    set name = coalesce(nullif(trim(p_name), ''), name),
        timezone = coalesce(nullif(trim(p_timezone), ''), timezone),
        currency = coalesce(nullif(trim(p_currency), ''), currency),
        image_url = coalesce(nullif(trim(coalesce(p_image_url, '')), ''), image_url),
        updated_at = now()
    where id = v_household_id and owner_user_id = v_user;
  end if;

  insert into app_household_members(
    household_id, user_id, email, role, permission_tier, status,
    can_manage_people, can_manage_child_profiles, can_view_household_income,
    can_manage_household_costs, can_manage_integrations, created_at, updated_at
  ) values (
    v_household_id, v_user, nullif(v_email, ''), 'owner', 'owner', 'active',
    true, true, true, true, true, now(), now()
  ) on conflict (household_id, user_id) do update set
    email = coalesce(excluded.email, app_household_members.email),
    role = 'owner',
    permission_tier = 'owner',
    status = 'active',
    can_manage_people = true,
    can_manage_child_profiles = true,
    can_view_household_income = true,
    can_manage_household_costs = true,
    can_manage_integrations = true,
    updated_at = now();

  insert into app_user_profiles(user_id, email, household_id, updated_at)
  values (v_user, nullif(v_email, ''), v_household_id, now())
  on conflict (user_id) do update set
    household_id = excluded.household_id,
    email = coalesce(app_user_profiles.email, excluded.email),
    updated_at = now();

  return v_household_id;
end;
$$;

create function public.app_create_household_invite(
  p_household_id uuid,
  p_invited_email text default null,
  p_role text default 'member',
  p_permission_tier text default 'member',
  p_expires_days int default 14,
  p_base_url text default 'http://localhost:3000'
) returns table(invite_id uuid, raw_token text, short_code text, join_link text, household_name text)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user uuid := auth.uid();
  v_email text := nullif(lower(trim(coalesce(p_invited_email, ''))), '');
  v_token text := encode(gen_random_bytes(32), 'hex');
  v_short text := upper(substr(encode(gen_random_bytes(5), 'hex'), 1, 8));
  v_id uuid;
  v_name text;
  v_role text := coalesce(nullif(trim(p_role), ''), 'member');
  v_tier text := coalesce(nullif(trim(p_permission_tier), ''), 'member');
begin
  if v_user is null then raise exception 'Not signed in'; end if;
  if not public.loop_can_manage_household(p_household_id) then raise exception 'Only household owners/admins can create invites.'; end if;
  if v_tier not in ('admin','parent','member','viewer') then raise exception 'Invalid permission tier for an invite.'; end if;
  if v_role not in ('admin','parent','member','viewer') then v_role := v_tier; end if;

  select name into v_name from app_households where id = p_household_id;
  if v_name is null then raise exception 'Household not found.'; end if;

  insert into household_join_invites(
    household_id, invited_by_user_id, invited_email, invited_email_hash,
    token_hash, short_code, role, permission_tier, status, expires_at, created_at, updated_at
  ) values (
    p_household_id,
    v_user,
    v_email,
    case when v_email is null then null else public.app_sha256(v_email) end,
    public.app_sha256(v_token),
    v_short,
    v_role,
    v_tier,
    'pending',
    now() + make_interval(days => greatest(1, least(coalesce(p_expires_days, 14), 60))),
    now(),
    now()
  ) returning id into v_id;

  invite_id := v_id;
  raw_token := v_token;
  short_code := v_short;
  join_link := rtrim(coalesce(p_base_url, 'http://localhost:3000'), '/') || '/household/join?token=' || v_token;
  household_name := coalesce(v_name, 'Loop household');
  return next;
end;
$$;

create function public.app_household_invite_preview(p_token text default null, p_invite_id uuid default null)
returns table(invite_id uuid, household_name text, invited_email text, role text, permission_tier text, status text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  return query
  select i.id, h.name, i.invited_email, i.role, i.permission_tier, i.status, i.expires_at
  from household_join_invites i
  left join app_households h on h.id = i.household_id
  where (p_invite_id is not null and i.id = p_invite_id)
     or (p_token is not null and length(trim(p_token)) <= 16 and upper(i.short_code) = upper(trim(p_token)))
     or (p_token is not null and length(trim(p_token)) > 16 and i.token_hash = public.app_sha256(trim(p_token)))
  order by i.created_at desc
  limit 1;
end;
$$;

create function public.app_accept_household_invite(p_token text default null, p_invite_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_invite household_join_invites%rowtype;
  v_tier text;
  v_role text;
  v_household_name text;
begin
  if v_user is null then raise exception 'Sign in before accepting a household invite.'; end if;
  if p_invite_id is null and coalesce(trim(p_token), '') = '' then raise exception 'Enter a household invite code or use a valid invite link.'; end if;

  select * into v_invite
  from household_join_invites
  where status = 'pending'
    and (
      (p_invite_id is not null and id = p_invite_id)
      or (p_token is not null and length(trim(p_token)) <= 16 and upper(short_code) = upper(trim(p_token)))
      or (p_token is not null and length(trim(p_token)) > 16 and token_hash = public.app_sha256(trim(p_token)))
    )
  order by created_at desc
  limit 1
  for update;

  if v_invite.id is null then raise exception 'Invite not found or already used.'; end if;
  if v_invite.expires_at < now() then
    update household_join_invites set status = 'expired', updated_at = now() where id = v_invite.id;
    raise exception 'This invite has expired. Ask for a fresh household invite.';
  end if;

  if coalesce(v_invite.invited_email, '') <> '' and lower(v_invite.invited_email) <> v_email then
    raise exception 'This invite was sent to %. Sign in with that email to accept it.', v_invite.invited_email;
  end if;
  if coalesce(v_invite.invited_email_hash, '') <> '' and v_invite.invited_email_hash <> public.app_sha256(v_email) then
    raise exception 'This invite was sent to a different email address.';
  end if;

  v_tier := coalesce(nullif(v_invite.permission_tier, ''), 'member');
  v_role := coalesce(nullif(v_invite.role, ''), 'member');

  insert into app_household_members(
    household_id, user_id, email, role, permission_tier, status,
    can_manage_people, can_manage_child_profiles, can_view_household_income,
    can_manage_household_costs, can_manage_integrations, created_at, updated_at
  ) values (
    v_invite.household_id,
    v_user,
    nullif(v_email, ''),
    v_role,
    v_tier,
    'active',
    v_tier in ('owner','admin'),
    v_tier in ('owner','admin','parent','parent_admin'),
    v_tier in ('owner','admin'),
    v_tier in ('owner','admin','parent','parent_admin'),
    v_tier in ('owner','admin'),
    now(),
    now()
  ) on conflict (household_id, user_id) do update set
    email = coalesce(excluded.email, app_household_members.email),
    role = excluded.role,
    permission_tier = excluded.permission_tier,
    status = 'active',
    can_manage_people = excluded.can_manage_people,
    can_manage_child_profiles = excluded.can_manage_child_profiles,
    can_view_household_income = excluded.can_view_household_income,
    can_manage_household_costs = excluded.can_manage_household_costs,
    can_manage_integrations = excluded.can_manage_integrations,
    removed_at = null,
    removed_by_user_id = null,
    updated_at = now();

  update household_join_invites
    set status = 'accepted', accepted_user_id = v_user, accepted_at = now(), updated_at = now()
    where id = v_invite.id;

  insert into app_user_profiles(user_id, email, household_id, updated_at)
  values (v_user, nullif(v_email, ''), v_invite.household_id, now())
  on conflict (user_id) do update set
    household_id = excluded.household_id,
    email = coalesce(app_user_profiles.email, excluded.email),
    updated_at = now();

  -- Link any pre-created adult/partner person record matching the invite email.
  if v_email <> '' then
    update people p
    set linked_user_id = v_user,
        email = coalesce(p.email, v_email),
        invite_email = coalesce(p.invite_email, v_email),
        account_status = 'linked',
        updated_at = now()
    from app_households h
    where h.id = v_invite.household_id
      and p.user_id = h.owner_user_id
      and coalesce(p.relationship, '') <> 'child'
      and (p.linked_user_id is null or p.linked_user_id = v_user)
      and (lower(coalesce(p.email, '')) = v_email or lower(coalesce(p.invite_email, '')) = v_email);
  end if;

  select name into v_household_name from app_households where id = v_invite.household_id;
  return jsonb_build_object('ok', true, 'household_id', v_invite.household_id, 'household_name', v_household_name, 'permission_tier', v_tier);
end;
$$;

create function public.app_update_household_member_role(p_member_id uuid, p_role text default 'member', p_permission_tier text default 'member')
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_member app_household_members%rowtype;
  v_tier text := coalesce(nullif(trim(p_permission_tier), ''), 'member');
  v_role text := coalesce(nullif(trim(p_role), ''), 'member');
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into v_member from app_household_members where id = p_member_id for update;
  if v_member.id is null then raise exception 'Member not found.'; end if;
  if not public.loop_can_manage_household(v_member.household_id) then raise exception 'Only household owners/admins can update member roles.'; end if;
  if v_member.permission_tier = 'owner' then raise exception 'Owner transfer is not available here yet.'; end if;
  if v_tier = 'owner' or v_role = 'owner' then raise exception 'Owner transfer is not available here yet.'; end if;

  update app_household_members
  set role = v_role,
      permission_tier = v_tier,
      can_manage_people = v_tier in ('owner','admin'),
      can_manage_child_profiles = v_tier in ('owner','admin','parent','parent_admin'),
      can_view_household_income = v_tier in ('owner','admin'),
      can_manage_household_costs = v_tier in ('owner','admin','parent','parent_admin'),
      can_manage_integrations = v_tier in ('owner','admin'),
      updated_at = now()
  where id = p_member_id;

  return jsonb_build_object('ok', true, 'member_id', p_member_id, 'permission_tier', v_tier);
end;
$$;

create function public.app_remove_household_member(p_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_member app_household_members%rowtype;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into v_member from app_household_members where id = p_member_id for update;
  if v_member.id is null then raise exception 'Member not found.'; end if;
  if v_member.user_id = auth.uid() then raise exception 'Use Leave household to remove yourself.'; end if;
  if v_member.permission_tier = 'owner' then raise exception 'The household owner cannot be removed here.'; end if;
  if not public.loop_can_manage_household(v_member.household_id) then raise exception 'Only household owners/admins can remove members.'; end if;

  update app_household_members
  set status = 'removed', removed_at = now(), removed_by_user_id = auth.uid(), updated_at = now()
  where id = p_member_id;

  update app_user_profiles
  set household_id = null, updated_at = now()
  where user_id = v_member.user_id and household_id = v_member.household_id;

  return jsonb_build_object('ok', true, 'member_id', p_member_id);
end;
$$;

create function public.app_leave_household(p_household_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_member app_household_members%rowtype;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into v_member from app_household_members
  where household_id = p_household_id and user_id = auth.uid() and status = 'active'
  for update;

  if v_member.id is null then raise exception 'You are not an active member of this household.'; end if;
  if v_member.permission_tier = 'owner' then raise exception 'The owner cannot leave until ownership transfer/delete household exists.'; end if;

  update app_household_members
  set status = 'left', removed_at = now(), removed_by_user_id = auth.uid(), updated_at = now()
  where id = v_member.id;

  update app_user_profiles
  set household_id = null, updated_at = now()
  where user_id = auth.uid() and household_id = p_household_id;

  return jsonb_build_object('ok', true, 'household_id', p_household_id);
end;
$$;

create function public.app_accept_person_invite(p_token text default null, p_invite_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_invite person_account_invites%rowtype;
  v_role text;
  v_tier text;
begin
  if v_user is null then raise exception 'Sign in before accepting this profile invite.'; end if;
  if p_invite_id is null and coalesce(trim(p_token), '') = '' then raise exception 'Missing invite token.'; end if;

  select * into v_invite
  from person_account_invites
  where status = 'pending'
    and (
      (p_invite_id is not null and id = p_invite_id)
      or (p_token is not null and token_hash = public.app_sha256(trim(p_token)))
    )
  order by created_at desc
  limit 1
  for update;

  if v_invite.id is null then raise exception 'Invite not found or already used.'; end if;
  if v_invite.expires_at is not null and v_invite.expires_at < now() then raise exception 'Invite has expired. Ask the household owner to send a fresh invite.'; end if;
  if lower(coalesce(v_invite.email, '')) <> '' and lower(v_invite.email) <> v_email then
    raise exception 'This invite was sent to %. Sign in with that email to claim it.', v_invite.email;
  end if;

  v_role := case when v_invite.relationship = 'child' then 'child' else 'member' end;
  v_tier := case when v_invite.relationship = 'child' then 'child' else 'member' end;

  insert into app_household_members(
    household_id, user_id, email, role, permission_tier, status,
    can_manage_people, can_manage_child_profiles, can_view_household_income,
    can_manage_household_costs, can_manage_integrations, created_at, updated_at
  ) values (
    v_invite.household_id,
    v_user,
    nullif(v_email, ''),
    v_role,
    v_tier,
    'active',
    false,
    false,
    v_invite.relationship <> 'child',
    v_invite.relationship <> 'child',
    false,
    now(),
    now()
  ) on conflict (household_id, user_id) do update set
    email = coalesce(excluded.email, app_household_members.email),
    role = excluded.role,
    permission_tier = excluded.permission_tier,
    status = 'active',
    can_view_household_income = excluded.can_view_household_income,
    can_manage_household_costs = excluded.can_manage_household_costs,
    updated_at = now();

  update people
  set linked_user_id = v_user,
      email = coalesce(nullif(v_email, ''), v_invite.email),
      invite_email = coalesce(nullif(v_email, ''), v_invite.email),
      account_status = 'linked',
      updated_at = now()
  where id = v_invite.person_id;

  update person_account_invites
  set status = 'accepted', accepted_at = now(), accepted_user_id = v_user, updated_at = now()
  where id = v_invite.id;

  insert into app_user_profiles(user_id, email, household_id, updated_at)
  values (v_user, nullif(v_email, ''), v_invite.household_id, now())
  on conflict (user_id) do update set
    household_id = excluded.household_id,
    email = coalesce(app_user_profiles.email, excluded.email),
    updated_at = now();

  return jsonb_build_object('ok', true, 'household_id', v_invite.household_id, 'person_id', v_invite.person_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Grants
-- ---------------------------------------------------------------------------

grant execute on function public.app_get_or_create_household(text, text, text, text) to authenticated;
grant execute on function public.app_create_household_invite(uuid, text, text, text, int, text) to authenticated;
grant execute on function public.app_household_invite_preview(text, uuid) to anon, authenticated;
grant execute on function public.app_accept_household_invite(text, uuid) to authenticated;
grant execute on function public.app_accept_person_invite(text, uuid) to authenticated;
grant execute on function public.app_update_household_member_role(uuid, text, text) to authenticated;
grant execute on function public.app_remove_household_member(uuid) to authenticated;
grant execute on function public.app_leave_household(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Verification / health check
-- ---------------------------------------------------------------------------

create function public.app_household_healthcheck()
returns table(check_name text, ok boolean, details text)
language sql
security definer
set search_path = public
set row_security = off
as $$
  select 'app_get_or_create_household_exists', to_regprocedure('public.app_get_or_create_household(text,text,text,text)') is not null, 'required RPC' union all
  select 'app_create_household_invite_exists', to_regprocedure('public.app_create_household_invite(uuid,text,text,text,int,text)') is not null, 'required RPC' union all
  select 'app_accept_household_invite_exists', to_regprocedure('public.app_accept_household_invite(text,uuid)') is not null, 'required RPC' union all
  select 'app_accept_person_invite_exists', to_regprocedure('public.app_accept_person_invite(text,uuid)') is not null, 'required RPC' union all
  select 'household_join_invites_table_exists', to_regclass('public.household_join_invites') is not null, 'invite table' union all
  select 'members_unique_index_exists', exists(select 1 from pg_indexes where schemaname='public' and tablename='app_household_members' and indexname in ('app_household_members_household_user_uidx','app_household_members_household_user_unique')), 'prevents duplicate memberships' union all
  select 'households_rls_enabled', coalesce((select relrowsecurity from pg_class where oid='public.app_households'::regclass), false), 'RLS on households' union all
  select 'members_rls_enabled', coalesce((select relrowsecurity from pg_class where oid='public.app_household_members'::regclass), false), 'RLS on members' union all
  select 'invites_rls_enabled', coalesce((select relrowsecurity from pg_class where oid='public.household_join_invites'::regclass), false), 'RLS on invites';
$$;

grant execute on function public.app_household_healthcheck() to authenticated;

-- After running this migration, verify with:
-- select * from public.app_household_healthcheck();
