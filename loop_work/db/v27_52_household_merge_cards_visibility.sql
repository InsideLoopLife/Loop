-- v27.52: Household merge visibility + card detail route support
-- Purpose:
-- 1) Make accepted household members see the household's people/cards where policy allows it.
-- 2) Keep adult ownership intact: each adult's own records remain under their own user_id.
-- 3) Link an accepted invite to an existing adult person profile when email matches.
-- 4) If no person profile exists for the accepting user, create a linked self profile so the family tree is not blank.
-- 5) Add household-aware SELECT policies for cards, people and wealth/income roll-ups.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create or replace function public.app_sha256(p_value text)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
immutable
as $$
begin
  return encode(extensions.digest(coalesce(p_value, '')::text, 'sha256'::text), 'hex'::text);
exception when undefined_function or invalid_schema_name then
  return encode(public.digest(coalesce(p_value, '')::text, 'sha256'::text), 'hex'::text);
end;
$$;

-- Rebuild the accept function because PostgreSQL cannot change return types in place.
drop function if exists public.app_accept_household_invite(text, uuid);
drop function if exists public.app_accept_household_invite(text);
drop function if exists public.app_accept_household_invite(uuid);

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
  v_owner_user_id uuid;
  v_profile_name text;
  v_linked_person_id uuid;
  v_created_self_person boolean := false;
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

  select owner_user_id, name into v_owner_user_id, v_household_name
  from app_households
  where id = v_invite.household_id;

  if v_owner_user_id is null then raise exception 'Household not found.'; end if;

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

  -- 1) Prefer claiming a pre-created adult/partner person record on the household owner's data.
  if v_email <> '' then
    update people p
    set linked_user_id = v_user,
        email = coalesce(nullif(p.email, ''), v_email),
        invite_email = coalesce(nullif(p.invite_email, ''), v_email),
        account_status = 'linked',
        updated_at = now()
    where p.user_id = v_owner_user_id
      and coalesce(p.relationship, '') <> 'child'
      and (p.linked_user_id is null or p.linked_user_id = v_user)
      and (lower(coalesce(p.email, '')) = v_email or lower(coalesce(p.invite_email, '')) = v_email)
    returning p.id into v_linked_person_id;
  end if;

  -- 2) If the accepting user already had their own self/person profile, make it explicitly linked.
  if v_linked_person_id is null then
    update people p
    set linked_user_id = v_user,
        email = coalesce(nullif(p.email, ''), nullif(v_email, '')),
        invite_email = coalesce(nullif(p.invite_email, ''), nullif(v_email, '')),
        account_status = 'linked',
        updated_at = now()
    where p.user_id = v_user
      and (p.linked_user_id = v_user or p.relationship = 'self' or lower(coalesce(p.email, '')) = v_email or lower(coalesce(p.invite_email, '')) = v_email)
    returning p.id into v_linked_person_id;
  end if;

  -- 3) If there is still no person profile, create one so the family tree is never empty after a join.
  if v_linked_person_id is null then
    select coalesce(nullif(display_name, ''), nullif(full_name, ''), split_part(v_email, '@', 1), 'Household member')
      into v_profile_name
    from app_user_profiles
    where user_id = v_user;

    insert into people(
      user_id, linked_user_id, name, relationship, email, invite_email, account_status,
      income_visible_to_household, costs_visible_to_household, household_can_add_costs,
      active_from, updated_at
    ) values (
      v_user, v_user, coalesce(v_profile_name, 'Household member'), 'self', nullif(v_email, ''), nullif(v_email, ''), 'linked',
      true, true, true,
      current_date, now()
    )
    returning id into v_linked_person_id;
    v_created_self_person := true;
  end if;

  return jsonb_build_object(
    'ok', true,
    'household_id', v_invite.household_id,
    'household_name', v_household_name,
    'permission_tier', v_tier,
    'linked_person_id', v_linked_person_id,
    'created_self_person', v_created_self_person
  );
end;
$$;

grant execute on function public.app_accept_household_invite(text, uuid) to authenticated;

-- Make common LOOP tables visible to confirmed household members.
-- Own rows are always visible; household rows are visible where membership allows it.
do $$
declare
  t text;
  sql text;
begin
  foreach t in array array[
    'people',
    'meals',
    'meal_logs',
    'food_logs',
    'nutrition_product_corrections',
    'app_user_profiles'
  ] loop
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='user_id') then
      execute format('alter table if exists public.%I enable row level security', t);
      execute format('drop policy if exists loop_household_read on public.%I', t);
      sql := format($fmt$
        create policy loop_household_read on public.%I
        for select to authenticated
        using (
          user_id = auth.uid()
          or exists (
            select 1
            from app_household_members me
            join app_household_members owner
              on owner.household_id = me.household_id
             and owner.user_id = public.%I.user_id
             and coalesce(owner.status, 'active') = 'active'
            where me.user_id = auth.uid()
              and coalesce(me.status, 'active') = 'active'
          )
        )
      $fmt$, t, t);
      execute sql;
    end if;
  end loop;

  foreach t in array array[
    'income_entries',
    'pay_events',
    'planned_items',
    'child_costs',
    'spending_entries',
    'financial_accounts',
    'homes',
    'home_valuation_sources',
    'home_mortgage_deals',
    'pension_accounts',
    'pension_funds',
    'investment_accounts',
    'investment_holdings'
  ] loop
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='user_id') then
      execute format('alter table if exists public.%I enable row level security', t);
      execute format('drop policy if exists loop_household_finance_read on public.%I', t);
      sql := format($fmt$
        create policy loop_household_finance_read on public.%I
        for select to authenticated
        using (
          user_id = auth.uid()
          or exists (
            select 1
            from app_household_members me
            join app_household_members owner
              on owner.household_id = me.household_id
             and owner.user_id = public.%I.user_id
             and coalesce(owner.status, 'active') = 'active'
            where me.user_id = auth.uid()
              and coalesce(me.status, 'active') = 'active'
              and (
                coalesce(me.can_view_household_income, false) = true
                or coalesce(me.permission_tier, 'member') in ('owner','admin')
              )
          )
        )
      $fmt$, t, t);
      execute sql;
    end if;
  end loop;
end $$;

-- Verification helper.
drop function if exists public.app_household_merge_healthcheck();
create function public.app_household_merge_healthcheck()
returns table(check_name text, ok boolean, detail text)
language sql
security definer
set search_path = public
as $$
  select 'app_accept_household_invite_exists', to_regprocedure('public.app_accept_household_invite(text,uuid)') is not null, 'accept invite RPC rebuilt' union all
  select 'app_sha256_exists', to_regprocedure('public.app_sha256(text)') is not null, 'digest-safe hashing exists' union all
  select 'household_join_invites_table', to_regclass('public.household_join_invites') is not null, 'invite table exists' union all
  select 'household_members_table', to_regclass('public.app_household_members') is not null, 'member table exists' union all
  select 'people_link_column', exists(select 1 from information_schema.columns where table_schema='public' and table_name='people' and column_name='linked_user_id'), 'people can link to auth users';
$$;

grant execute on function public.app_household_merge_healthcheck() to authenticated;
