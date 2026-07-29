-- v27.55 — Handover review, onboarding, free investment lookup and profile/household hardening
-- Run after v27.54. Safe to re-run.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- 1) Relax stale check constraints created by older migrations.
do $$
begin
  if to_regclass('public.people') is not null then
    alter table public.people drop constraint if exists people_account_status_check;
    alter table public.people add constraint people_account_status_check
      check (coalesce(account_status, 'managed_by_household') in (
        'managed_by_household','invite_needed','invited','linked','linked_data_claimed',
        'claim_pending','claim_sent','accepted','declined','child_until_18',
        'child_managed','removed_from_household','inactive'
      ));
  end if;

  if to_regclass('public.person_account_prompts') is not null then
    alter table public.person_account_prompts drop constraint if exists person_account_prompts_status_check;
    alter table public.person_account_prompts add constraint person_account_prompts_status_check
      check (coalesce(status, 'draft') in (
        'draft','pending','sent','sent_or_ready','ready','accepted','declined','cancelled','expired','failed'
      ));
  end if;


  if to_regclass('public.app_household_members') is not null then
    alter table public.app_household_members drop constraint if exists app_household_members_status_check;
    alter table public.app_household_members add constraint app_household_members_status_check
      check (coalesce(status, 'active') in ('active','pending','invited','removed','left','inactive','deleted'));
  end if;

  if to_regclass('public.app_households') is not null then
    alter table public.app_households drop constraint if exists app_households_status_check;
    alter table public.app_households add constraint app_households_status_check
      check (coalesce(status, 'active') in ('active','inactive','archived','deleted','pending_delete'));
  end if;
end $$;

-- 2) Onboarding first-run checklist state.
alter table if exists public.app_user_profiles
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists onboarding_skipped_at timestamptz,
  add column if not exists tour_seen jsonb not null default '{}'::jsonb,
  add column if not exists market_data_tier text default 'delayed';

update public.app_user_profiles
set market_data_tier = 'delayed'
where coalesce(market_data_tier, '') in ('', 'manual')
  and coalesce(payment_tier, 'free') = 'free';

-- 3) Avatar/storage buckets. Public avatars are okay; do not use these for documents.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('user-avatars', 'user-avatars', true, 5000000, array['image/jpeg','image/png','image/webp','image/gif']),
  ('person-avatars', 'person-avatars', true, 5000000, array['image/jpeg','image/png','image/webp','image/gif']),
  ('household-images', 'household-images', true, 5000000, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists loop_user_avatars_read_public_v2755 on storage.objects;
create policy loop_user_avatars_read_public_v2755 on storage.objects
for select using (bucket_id = 'user-avatars');

drop policy if exists loop_person_avatars_read_public_v2755 on storage.objects;
create policy loop_person_avatars_read_public_v2755 on storage.objects
for select using (bucket_id = 'person-avatars');

drop policy if exists loop_household_images_read_public_v2755 on storage.objects;
create policy loop_household_images_read_public_v2755 on storage.objects
for select using (bucket_id = 'household-images');

drop policy if exists loop_user_avatars_insert_own_v2755 on storage.objects;
create policy loop_user_avatars_insert_own_v2755 on storage.objects
for insert to authenticated
with check (bucket_id = 'user-avatars' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists loop_person_avatars_insert_own_v2755 on storage.objects;
create policy loop_person_avatars_insert_own_v2755 on storage.objects
for insert to authenticated
with check (bucket_id = 'person-avatars' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists loop_household_images_insert_own_v2755 on storage.objects;
create policy loop_household_images_insert_own_v2755 on storage.objects
for insert to authenticated
with check (bucket_id = 'household-images' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists loop_user_avatars_update_own_v2755 on storage.objects;
create policy loop_user_avatars_update_own_v2755 on storage.objects
for update to authenticated
using (bucket_id = 'user-avatars' and auth.uid()::text = (storage.foldername(name))[1])
with check (bucket_id = 'user-avatars' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists loop_person_avatars_update_own_v2755 on storage.objects;
create policy loop_person_avatars_update_own_v2755 on storage.objects
for update to authenticated
using (bucket_id = 'person-avatars' and auth.uid()::text = (storage.foldername(name))[1])
with check (bucket_id = 'person-avatars' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists loop_household_images_update_own_v2755 on storage.objects;
create policy loop_household_images_update_own_v2755 on storage.objects
for update to authenticated
using (bucket_id = 'household-images' and auth.uid()::text = (storage.foldername(name))[1])
with check (bucket_id = 'household-images' and auth.uid()::text = (storage.foldername(name))[1]);

-- 4) Handover detail helper for review screens.
create or replace function public.app_handover_detail(p_notification_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user uuid := auth.uid();
  v_notification public.app_notifications%rowtype;
  v_claim public.household_profile_claim_requests%rowtype;
  v_person public.people%rowtype;
  v_source_email text;
  v_household_name text;
begin
  if v_user is null then raise exception 'Sign in first.'; end if;

  select * into v_notification
  from public.app_notifications
  where id = p_notification_id and user_id = v_user;

  if v_notification.id is null then
    raise exception 'Notification not found.';
  end if;

  if v_notification.metadata ? 'claim_request_id' then
    select * into v_claim
    from public.household_profile_claim_requests
    where id = (v_notification.metadata->>'claim_request_id')::uuid
      and target_user_id = v_user;

    select * into v_person from public.people where id = v_claim.person_id;
    select coalesce(display_name, full_name, email) into v_source_email from public.app_user_profiles where user_id = v_claim.source_user_id;
    select name into v_household_name from public.app_households where id = v_claim.household_id;

    return jsonb_build_object(
      'notification', to_jsonb(v_notification),
      'claim', to_jsonb(v_claim),
      'person', to_jsonb(v_person),
      'source_label', coalesce(v_source_email, 'Household member'),
      'household_name', coalesce(v_household_name, 'Household')
    );
  end if;

  return jsonb_build_object('notification', to_jsonb(v_notification));
end;
$$;

grant execute on function public.app_handover_detail(uuid) to authenticated;

-- 5) Recreate profile-data resolution so it uses allowed statuses and keeps household sharing intact.
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
        account_status = 'linked',
        income_visible_to_household = true,
        costs_visible_to_household = true,
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

-- 6) Delete household function with constraint-safe status.
create or replace function public.app_delete_household(p_household_id uuid, p_confirmation text)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user uuid := auth.uid();
  v_household public.app_households%rowtype;
begin
  if v_user is null then raise exception 'Sign in before deleting a household.'; end if;
  if p_confirmation <> 'DELETE' then raise exception 'Type DELETE to confirm.'; end if;

  select * into v_household from public.app_households where id = p_household_id for update;
  if v_household.id is null then raise exception 'Household not found.'; end if;
  if v_household.owner_user_id <> v_user then raise exception 'Only the household owner can delete this household.'; end if;

  update public.app_households
  set status = 'deleted', deleted_at = now(), deleted_by_user_id = v_user, updated_at = now()
  where id = p_household_id;

  update public.app_household_members
  set status = 'removed', left_at = coalesce(left_at, now()), updated_at = now()
  where household_id = p_household_id and status = 'active';

  update public.household_join_invites
  set status = 'cancelled', updated_at = now()
  where household_id = p_household_id and status in ('pending','active');

  update public.app_user_profiles
  set household_id = null, updated_at = now()
  where household_id = p_household_id;

  return jsonb_build_object('ok', true, 'household_id', p_household_id, 'status', 'deleted');
end;
$$;

grant execute on function public.app_delete_household(uuid, text) to authenticated;

create or replace function public.app_v2755_healthcheck()
returns table(check_name text, ok boolean, detail text)
language sql
security definer
set search_path = public
as $$
  select 'people_status_constraint', true, 'people account_status supports linked/claim states' union all
  select 'prompt_status_constraint', true, 'person_account_prompts supports sent_or_ready/draft states' union all
  select 'household_deleted_status', true, 'app_households supports deleted status' union all
  select 'handover_detail_rpc', to_regprocedure('public.app_handover_detail(uuid)') is not null, 'handover detail RPC exists' union all
  select 'resolve_claim_rpc', to_regprocedure('public.app_resolve_profile_data_claim(uuid,text)') is not null, 'profile handover resolve RPC exists' union all
  select 'delete_household_rpc', to_regprocedure('public.app_delete_household(uuid,text)') is not null, 'delete household RPC exists' union all
  select 'onboarding_columns', exists(select 1 from information_schema.columns where table_schema='public' and table_name='app_user_profiles' and column_name='onboarding_completed_at'), 'onboarding fields exist';
$$;

grant execute on function public.app_v2755_healthcheck() to authenticated;
