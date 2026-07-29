-- v27.56 Inside LOOP admin + household SQL hotfix
-- Purpose:
-- 1) Fix PostgreSQL function replacement errors caused by old parameter defaults.
-- 2) Ensure household delete function can be recreated cleanly.
-- 3) Add a small verification function.

drop function if exists public.app_delete_household(uuid, text);

create or replace function public.app_delete_household(
  p_household_id uuid,
  p_confirmation text
)
returns table (
  ok boolean,
  household_id uuid,
  status text,
  message text
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_owner boolean := false;
  v_status_column_exists boolean := false;
begin
  if v_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  if coalesce(p_confirmation, '') <> 'DELETE' then
    raise exception 'Type DELETE to confirm household deletion.';
  end if;

  select exists (
    select 1
    from public.app_household_members hm
    where hm.household_id = p_household_id
      and hm.user_id = v_user_id
      and coalesce(hm.status, 'active') = 'active'
      and lower(coalesce(hm.role, 'member')) = 'owner'
  ) into v_is_owner;

  if not v_is_owner then
    raise exception 'Only the household owner can delete this household.';
  end if;

  if to_regclass('public.household_join_invites') is not null then
    update public.household_join_invites
    set status = case
        when status in ('pending', 'active') then 'expired'
        else status
      end
    where household_id = p_household_id;
  end if;

  update public.app_household_members
  set status = case
      when status in ('active', 'pending', 'member', 'owner', 'invited', 'accepted') then 'removed'
      else status
    end,
    updated_at = now()
  where household_id = p_household_id;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'app_households'
      and column_name = 'status'
  ) into v_status_column_exists;

  if v_status_column_exists then
    update public.app_households
    set status = 'deleted',
        updated_at = now()
    where id = p_household_id;
  else
    update public.app_households
    set updated_at = now()
    where id = p_household_id;
  end if;

  return query
  select true, p_household_id, 'deleted'::text, 'Household deleted.'::text;
end;
$$;

grant execute on function public.app_delete_household(uuid, text) to authenticated;

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'app_households'
      and constraint_name = 'app_households_status_check'
  ) then
    alter table public.app_households drop constraint app_households_status_check;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'app_households'
      and column_name = 'status'
  ) then
    alter table public.app_households
      add constraint app_households_status_check
      check (status in ('active', 'inactive', 'archived', 'deleted'));
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'app_household_members'
      and constraint_name = 'app_household_members_status_check'
  ) then
    alter table public.app_household_members drop constraint app_household_members_status_check;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'app_household_members'
      and column_name = 'status'
  ) then
    alter table public.app_household_members
      add constraint app_household_members_status_check
      check (status in ('active', 'pending', 'invited', 'accepted', 'declined', 'removed', 'left', 'deleted'));
  end if;
end $$;

create or replace function public.app_v2756_healthcheck()
returns table (
  check_name text,
  ok boolean,
  detail text
)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select
    'app_delete_household_rpc_exists'::text,
    exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'app_delete_household'
        and pg_get_function_arguments(p.oid) = 'p_household_id uuid, p_confirmation text'
    ) as ok,
    'Function public.app_delete_household(uuid,text) is installed.'::text
  union all
  select
    'app_households_status_constraint'::text,
    exists (
      select 1
      from information_schema.table_constraints
      where table_schema = 'public'
        and table_name = 'app_households'
        and constraint_name = 'app_households_status_check'
    ) as ok,
    'Household statuses support active/inactive/archived/deleted.'::text
  union all
  select
    'app_household_members_status_constraint'::text,
    exists (
      select 1
      from information_schema.table_constraints
      where table_schema = 'public'
        and table_name = 'app_household_members'
        and constraint_name = 'app_household_members_status_check'
    ) as ok,
    'Member statuses support active/pending/invited/accepted/declined/removed/left/deleted.'::text;
$$;

grant execute on function public.app_v2756_healthcheck() to authenticated;
grant execute on function public.app_v2756_healthcheck() to anon;
