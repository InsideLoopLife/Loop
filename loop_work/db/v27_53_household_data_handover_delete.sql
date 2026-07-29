
-- v27.53: Household data handover/claim notifications + deletable households
-- Run after v27.52. This is intentionally additive and safe to re-run.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;


alter table if exists public.app_notifications
  add column if not exists category text,
  add column if not exists action_status text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists read_at timestamptz;

alter table if exists public.app_households
  add column if not exists status text default 'active',
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by_user_id uuid references auth.users(id) on delete set null;

create table if not exists public.household_profile_claim_requests (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.app_households(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  source_user_id uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  requested_by_user_id uuid not null references auth.users(id) on delete cascade,
  target_email text,
  status text not null default 'pending' check (status in ('pending','accepted','declined','expired','cancelled')),
  message text,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(household_id, person_id, target_user_id, status)
);

create index if not exists household_profile_claim_requests_target_status_idx
  on public.household_profile_claim_requests(target_user_id, status, created_at desc);
create index if not exists household_profile_claim_requests_person_idx
  on public.household_profile_claim_requests(person_id, status, created_at desc);

alter table if exists public.household_profile_claim_requests enable row level security;

drop policy if exists household_profile_claim_select_involved_v2753 on public.household_profile_claim_requests;
create policy household_profile_claim_select_involved_v2753 on public.household_profile_claim_requests
for select to authenticated
using (
  target_user_id = auth.uid()
  or requested_by_user_id = auth.uid()
  or exists (
    select 1 from public.app_household_members m
    where m.household_id = household_profile_claim_requests.household_id
      and m.user_id = auth.uid()
      and coalesce(m.status, 'active') = 'active'
      and coalesce(m.permission_tier, 'member') in ('owner','admin')
  )
);

-- Helper: can the current user manage this household?
create or replace function public.app_can_manage_household(p_household_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.app_household_members m
    join public.app_households h on h.id = m.household_id
    where m.household_id = p_household_id
      and m.user_id = auth.uid()
      and coalesce(m.status, 'active') = 'active'
      and coalesce(h.status, 'active') <> 'deleted'
      and (
        h.owner_user_id = auth.uid()
        or coalesce(m.permission_tier, 'member') in ('owner','admin')
        or coalesce(m.can_manage_people, false) = true
      )
  );
$$;

grant execute on function public.app_can_manage_household(uuid) to authenticated;

create or replace function public.app_profile_claim_summary(p_person_id uuid, p_source_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_summary jsonb := '{}'::jsonb;
  v_count int := 0;
begin
  if to_regclass('public.pay_events') is not null then
    select count(*) into v_count from public.pay_events where person_id = p_person_id and user_id = p_source_user_id;
    v_summary := v_summary || jsonb_build_object('pay_events', v_count);
  end if;
  if to_regclass('public.income_entries') is not null then
    select count(*) into v_count from public.income_entries where person_id = p_person_id and user_id = p_source_user_id;
    v_summary := v_summary || jsonb_build_object('income_entries', v_count);
  end if;
  if to_regclass('public.planned_items') is not null then
    select count(*) into v_count from public.planned_items where person_id = p_person_id and user_id = p_source_user_id;
    v_summary := v_summary || jsonb_build_object('planned_items', v_count);
  end if;
  if to_regclass('public.spending_entries') is not null and exists (
    select 1 from information_schema.columns where table_schema='public' and table_name='spending_entries' and column_name='person_id'
  ) then
    execute 'select count(*) from public.spending_entries where person_id = $1 and user_id = $2' into v_count using p_person_id, p_source_user_id;
    v_summary := v_summary || jsonb_build_object('spending_entries', v_count);
  end if;
  if to_regclass('public.food_logs') is not null and exists (
    select 1 from information_schema.columns where table_schema='public' and table_name='food_logs' and column_name='person_id'
  ) then
    execute 'select count(*) from public.food_logs where person_id = $1 and user_id = $2' into v_count using p_person_id, p_source_user_id;
    v_summary := v_summary || jsonb_build_object('food_logs', v_count);
  end if;
  if to_regclass('public.meal_logs') is not null and exists (
    select 1 from information_schema.columns where table_schema='public' and table_name='meal_logs' and column_name='person_id'
  ) then
    execute 'select count(*) from public.meal_logs where person_id = $1 and user_id = $2' into v_count using p_person_id, p_source_user_id;
    v_summary := v_summary || jsonb_build_object('meal_logs', v_count);
  end if;

  return v_summary;
end;
$$;

grant execute on function public.app_profile_claim_summary(uuid, uuid) to authenticated;

create or replace function public.app_request_profile_data_claim(p_person_id uuid, p_message text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user uuid := auth.uid();
  v_person public.people%rowtype;
  v_household_id uuid;
  v_household_name text;
  v_target_email text;
  v_summary jsonb;
  v_request_id uuid;
  v_title text;
  v_body text;
begin
  if v_user is null then raise exception 'Sign in before requesting a profile handover.'; end if;

  select * into v_person from public.people where id = p_person_id;
  if v_person.id is null then raise exception 'Person profile not found.'; end if;
  if v_person.linked_user_id is null then raise exception 'This person must be linked to their own account before they can accept profile data.'; end if;
  if v_person.linked_user_id = v_person.user_id then raise exception 'This profile is already owned by the linked account.'; end if;

  select m.household_id, h.name into v_household_id, v_household_name
  from public.app_household_members m
  join public.app_household_members owner_member
    on owner_member.household_id = m.household_id
   and owner_member.user_id = v_person.user_id
   and coalesce(owner_member.status, 'active') = 'active'
  join public.app_households h on h.id = m.household_id
  where m.user_id = v_user
    and coalesce(m.status, 'active') = 'active'
    and coalesce(h.status, 'active') <> 'deleted'
  order by m.created_at asc
  limit 1;

  if v_household_id is null then raise exception 'This profile is not in your active household.'; end if;
  if not public.app_can_manage_household(v_household_id) and v_person.user_id <> v_user then
    raise exception 'Only household owners/admins can request a profile handover.';
  end if;

  select lower(coalesce(email, v_person.email, v_person.invite_email, '')) into v_target_email
  from public.app_user_profiles where user_id = v_person.linked_user_id;

  v_summary := public.app_profile_claim_summary(v_person.id, v_person.user_id);

  insert into public.household_profile_claim_requests(
    household_id, person_id, source_user_id, target_user_id, requested_by_user_id,
    target_email, status, message, summary, created_at, updated_at
  ) values (
    v_household_id, v_person.id, v_person.user_id, v_person.linked_user_id, v_user,
    nullif(v_target_email, ''), 'pending', nullif(p_message, ''), v_summary, now(), now()
  )
  on conflict (household_id, person_id, target_user_id, status)
  do update set
    requested_by_user_id = excluded.requested_by_user_id,
    message = excluded.message,
    summary = excluded.summary,
    updated_at = now()
  returning id into v_request_id;

  v_title := 'Review data Dan added for you';
  v_body := coalesce(
    nullif(p_message, ''),
    format('%s has added information for %s in %s. Review whether you want to keep it and add it to your own profile.', coalesce((select email from auth.users where id = v_user), 'A household member'), coalesce(v_person.name, 'your profile'), coalesce(v_household_name, 'your household'))
  );

  insert into public.app_notifications(
    user_id, household_id, notification_type, category, channel, action_status,
    severity, status, title, body, cta_label, cta_href, metadata, created_at
  ) values (
    v_person.linked_user_id, v_household_id, 'household_profile_claim', 'household', 'in_app', 'pending',
    'warning', 'unread', v_title, v_body, 'Review handover', '/notifications?tab=household',
    jsonb_build_object('claim_request_id', v_request_id, 'person_id', v_person.id, 'source_user_id', v_person.user_id, 'summary', v_summary), now()
  );

  return jsonb_build_object('ok', true, 'request_id', v_request_id, 'target_user_id', v_person.linked_user_id, 'summary', v_summary);
end;
$$;

grant execute on function public.app_request_profile_data_claim(uuid, text) to authenticated;

create or replace function public.app_resolve_profile_data_claim(p_request_id uuid, p_decision text)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user uuid := auth.uid();
  v_request public.household_profile_claim_requests%rowtype;
  v_decision text := lower(coalesce(p_decision, ''));
  v_rows jsonb := '{}'::jsonb;
  v_count int := 0;
begin
  if v_user is null then raise exception 'Sign in before responding to a profile handover.'; end if;
  if v_decision not in ('accept','accepted','keep','decline','declined','reject','rejected') then raise exception 'Choose accept or decline.'; end if;

  select * into v_request
  from public.household_profile_claim_requests
  where id = p_request_id
  for update;

  if v_request.id is null then raise exception 'Profile handover request not found.'; end if;
  if v_request.target_user_id <> v_user then raise exception 'This profile handover request belongs to another user.'; end if;
  if v_request.status <> 'pending' then raise exception 'This profile handover request has already been answered.'; end if;

  if v_decision in ('accept','accepted','keep') then
    if to_regclass('public.pay_events') is not null then
      update public.pay_events set user_id = v_request.target_user_id where person_id = v_request.person_id and user_id = v_request.source_user_id;
      get diagnostics v_count = row_count; v_rows := v_rows || jsonb_build_object('pay_events', v_count);
    end if;
    if to_regclass('public.pay_event_monthly_overrides') is not null then
      update public.pay_event_monthly_overrides set user_id = v_request.target_user_id where person_id = v_request.person_id and user_id = v_request.source_user_id;
      get diagnostics v_count = row_count; v_rows := v_rows || jsonb_build_object('pay_event_monthly_overrides', v_count);
    end if;
    if to_regclass('public.income_entries') is not null then
      update public.income_entries set user_id = v_request.target_user_id where person_id = v_request.person_id and user_id = v_request.source_user_id;
      get diagnostics v_count = row_count; v_rows := v_rows || jsonb_build_object('income_entries', v_count);
    end if;
    if to_regclass('public.planned_items') is not null then
      update public.planned_items set user_id = v_request.target_user_id where person_id = v_request.person_id and user_id = v_request.source_user_id;
      get diagnostics v_count = row_count; v_rows := v_rows || jsonb_build_object('planned_items', v_count);
    end if;

    -- Optional/variable tables: only run when matching columns exist.
    if to_regclass('public.spending_entries') is not null and exists(select 1 from information_schema.columns where table_schema='public' and table_name='spending_entries' and column_name='person_id') then
      execute 'update public.spending_entries set user_id = $1 where person_id = $2 and user_id = $3' using v_request.target_user_id, v_request.person_id, v_request.source_user_id;
      get diagnostics v_count = row_count; v_rows := v_rows || jsonb_build_object('spending_entries', v_count);
    end if;
    if to_regclass('public.food_logs') is not null and exists(select 1 from information_schema.columns where table_schema='public' and table_name='food_logs' and column_name='person_id') then
      execute 'update public.food_logs set user_id = $1 where person_id = $2 and user_id = $3' using v_request.target_user_id, v_request.person_id, v_request.source_user_id;
      get diagnostics v_count = row_count; v_rows := v_rows || jsonb_build_object('food_logs', v_count);
    end if;
    if to_regclass('public.meal_logs') is not null and exists(select 1 from information_schema.columns where table_schema='public' and table_name='meal_logs' and column_name='person_id') then
      execute 'update public.meal_logs set user_id = $1 where person_id = $2 and user_id = $3' using v_request.target_user_id, v_request.person_id, v_request.source_user_id;
      get diagnostics v_count = row_count; v_rows := v_rows || jsonb_build_object('meal_logs', v_count);
    end if;

    update public.people
    set user_id = v_request.target_user_id,
        linked_user_id = v_request.target_user_id,
        account_status = 'linked_data_claimed',
        updated_at = now()
    where id = v_request.person_id;

    update public.household_profile_claim_requests
    set status = 'accepted', responded_at = now(), updated_at = now(), summary = coalesce(summary, '{}'::jsonb) || jsonb_build_object('transferred', v_rows)
    where id = v_request.id;

    update public.app_notifications
    set status = 'read', action_status = 'accepted', read_at = now()
    where user_id = v_user
      and notification_type = 'household_profile_claim'
      and metadata->>'claim_request_id' = v_request.id::text;

    return jsonb_build_object('ok', true, 'status', 'accepted', 'transferred', v_rows);
  else
    update public.household_profile_claim_requests
    set status = 'declined', responded_at = now(), updated_at = now()
    where id = v_request.id;

    update public.app_notifications
    set status = 'dismissed', action_status = 'declined', read_at = now()
    where user_id = v_user
      and notification_type = 'household_profile_claim'
      and metadata->>'claim_request_id' = v_request.id::text;

    return jsonb_build_object('ok', true, 'status', 'declined');
  end if;
end;
$$;

grant execute on function public.app_resolve_profile_data_claim(uuid, text) to authenticated;

create or replace function public.app_delete_household(p_household_id uuid, p_confirmation text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user uuid := auth.uid();
  v_household public.app_households%rowtype;
  v_member_count int := 0;
begin
  if v_user is null then raise exception 'Sign in before deleting a household.'; end if;
  if upper(coalesce(trim(p_confirmation), '')) <> 'DELETE' then raise exception 'Type DELETE to confirm household deletion.'; end if;

  select * into v_household from public.app_households where id = p_household_id for update;
  if v_household.id is null then raise exception 'Household not found.'; end if;
  if v_household.owner_user_id <> v_user then raise exception 'Only the household owner can delete this household.'; end if;

  update public.app_households
  set status = 'deleted', deleted_at = now(), deleted_by_user_id = v_user, updated_at = now()
  where id = p_household_id;

  update public.app_household_members
  set status = 'removed', removed_at = now(), removed_by_user_id = v_user, updated_at = now()
  where household_id = p_household_id and coalesce(status, 'active') = 'active';
  get diagnostics v_member_count = row_count;

  update public.app_user_profiles
  set household_id = null, updated_at = now()
  where household_id = p_household_id;

  update public.household_join_invites
  set status = 'expired', updated_at = now()
  where household_id = p_household_id and status = 'pending';

  update public.person_account_invites
  set status = 'expired', updated_at = now()
  where household_id = p_household_id and status = 'pending';

  update public.household_profile_claim_requests
  set status = 'cancelled', updated_at = now()
  where household_id = p_household_id and status = 'pending';

  insert into public.app_notifications(
    user_id, household_id, notification_type, category, channel, action_status, severity, status, title, body, metadata, created_at
  )
  select user_id, p_household_id, 'household_deleted', 'household', 'in_app', 'completed', 'warning', 'unread',
         'Household deleted',
         'The household has been deleted by the owner. Your private account data remains under your own profile.',
         jsonb_build_object('household_id', p_household_id), now()
  from public.app_household_members
  where household_id = p_household_id and user_id <> v_user;

  return jsonb_build_object('ok', true, 'household_id', p_household_id, 'members_removed', v_member_count);
end;
$$;

grant execute on function public.app_delete_household(uuid, text) to authenticated;

-- Active context/read helpers should ignore deleted households.
create or replace function public.app_household_claim_healthcheck()
returns table(check_name text, ok boolean, detail text)
language sql
security definer
set search_path = public
as $$
  select 'claim_request_table', to_regclass('public.household_profile_claim_requests') is not null, 'profile claim table exists' union all
  select 'request_claim_rpc', to_regprocedure('public.app_request_profile_data_claim(uuid,text)') is not null, 'request handover RPC exists' union all
  select 'resolve_claim_rpc', to_regprocedure('public.app_resolve_profile_data_claim(uuid,text)') is not null, 'accept/decline handover RPC exists' union all
  select 'delete_household_rpc', to_regprocedure('public.app_delete_household(uuid,text)') is not null, 'delete household RPC exists' union all
  select 'household_deleted_column', exists(select 1 from information_schema.columns where table_schema='public' and table_name='app_households' and column_name='deleted_at'), 'soft-delete columns exist';
$$;

grant execute on function public.app_household_claim_healthcheck() to authenticated;
