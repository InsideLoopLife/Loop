-- v27.54: Household notification constraints, nutrition approval prompts, sharing policies and card privacy
-- Run after v27.53. Safe to re-run.

create schema if not exists extensions;
do $$ begin
  begin
    create extension if not exists pgcrypto with schema extensions;
  exception when duplicate_object then null;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 1) Check constraint repair
-- These fix the runtime errors caused by older constraints that did not know
-- about new statuses introduced during the household handover work.
-- ---------------------------------------------------------------------------

do $$ begin
  if to_regclass('public.people') is not null then
    alter table public.people drop constraint if exists people_account_status_check;
    alter table public.people add constraint people_account_status_check
      check (account_status is null or account_status in (
        'managed_by_household','invite_needed','invited','linked','linked_data_claimed',
        'child_until_18','child_managed','removed_from_household'
      ));
  end if;
end $$;

do $$ begin
  if to_regclass('public.person_account_prompts') is not null then
    alter table public.person_account_prompts drop constraint if exists person_account_prompts_status_check;
    alter table public.person_account_prompts add constraint person_account_prompts_status_check
      check (status in ('draft','ready','pending','sent','sent_or_ready','accepted','cancelled'));
  end if;
end $$;

do $$ begin
  if to_regclass('public.app_households') is not null then
    alter table public.app_households drop constraint if exists app_households_status_check;
    alter table public.app_households add constraint app_households_status_check
      check (status is null or status in ('active','archived','inactive','deleted'));
  end if;
end $$;

do $$ begin
  if to_regclass('public.app_household_members') is not null then
    alter table public.app_household_members drop constraint if exists app_household_members_status_check;
    alter table public.app_household_members add constraint app_household_members_status_check
      check (status is null or status in ('active','pending','invited','removed','left','deleted'));
  end if;
end $$;

do $$ begin
  if to_regclass('public.app_notifications') is not null then
    alter table public.app_notifications drop constraint if exists app_notifications_status_check;
    alter table public.app_notifications add constraint app_notifications_status_check
      check (status in ('queued','unread','read','dismissed','sent','failed'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2) Meal/card privacy model
-- Products/ingredients can be shared as reference data. Recipes/meals/takeaways
-- stay private to the household/user that created them.
-- ---------------------------------------------------------------------------

alter table if exists public.meals
  add column if not exists library_scope text not null default 'household_private',
  add column if not exists reference_lock_level text not null default 'user_editable',
  add column if not exists source_fingerprint text;

alter table if exists public.meals drop constraint if exists meals_library_scope_check;
alter table if exists public.meals add constraint meals_library_scope_check
  check (library_scope in ('global_reference','household_private','private'));

alter table if exists public.meals drop constraint if exists meals_reference_lock_level_check;
alter table if exists public.meals add constraint meals_reference_lock_level_check
  check (reference_lock_level in ('user_editable','reference_locked','admin_locked'));

update public.meals
set library_scope = case
    when coalesce(card_kind, meal_category, '') in ('product','drink_product','ingredient') then 'global_reference'
    else 'household_private'
  end,
  reference_lock_level = case
    when coalesce(card_kind, meal_category, '') in ('product','drink_product','ingredient') then 'reference_locked'
    else 'user_editable'
  end
where library_scope is null or library_scope = 'household_private';

alter table if exists public.food_logs
  add column if not exists approval_status text not null default 'accepted';

alter table if exists public.food_logs drop constraint if exists food_logs_approval_status_check;
alter table if exists public.food_logs add constraint food_logs_approval_status_check
  check (approval_status in ('accepted','pending','declined'));

-- Select-only sharing: globally referenced products/ingredients can be found by anyone.
-- Household-private recipes/menu estimates remain visible only to active household members.
drop policy if exists meals_select_reference_or_household_v2754 on public.meals;
create policy meals_select_reference_or_household_v2754 on public.meals
for select to authenticated
using (
  user_id = auth.uid()
  or library_scope = 'global_reference'
  or exists (
    select 1
    from public.app_household_members viewer
    join public.app_household_members owner_member
      on owner_member.household_id = viewer.household_id
     and owner_member.user_id = meals.user_id
     and coalesce(owner_member.status, 'active') = 'active'
    where viewer.user_id = auth.uid()
      and coalesce(viewer.status, 'active') = 'active'
      and coalesce(meals.library_scope, 'household_private') = 'household_private'
  )
);

-- Nutrition logs allocated to a person are visible to the linked person and active household members.
drop policy if exists food_logs_select_household_allocations_v2754 on public.food_logs;
create policy food_logs_select_household_allocations_v2754 on public.food_logs
for select to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.people p
    where p.id = food_logs.person_id
      and p.linked_user_id = auth.uid()
  )
  or exists (
    select 1
    from public.app_household_members viewer
    join public.app_household_members owner_member
      on owner_member.household_id = viewer.household_id
     and owner_member.user_id = food_logs.user_id
     and coalesce(owner_member.status, 'active') = 'active'
    where viewer.user_id = auth.uid()
      and coalesce(viewer.status, 'active') = 'active'
  )
);

-- ---------------------------------------------------------------------------
-- 3) Household/wealth sharing policies
-- These allow household-visible finance to roll up across members without using
-- a service-role key in the app.
-- ---------------------------------------------------------------------------

-- Helper kept deliberately simple: are auth.uid() and owner_user_id active in the same household?
create or replace function public.app_same_active_household(p_owner_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.app_household_members viewer
    join public.app_household_members owner_member
      on owner_member.household_id = viewer.household_id
     and owner_member.user_id = p_owner_user_id
     and coalesce(owner_member.status, 'active') = 'active'
    join public.app_households h on h.id = viewer.household_id
    where viewer.user_id = auth.uid()
      and coalesce(viewer.status, 'active') = 'active'
      and coalesce(h.status, 'active') = 'active'
  );
$$;

grant execute on function public.app_same_active_household(uuid) to authenticated;

-- Pay/income: require the related person to share income where a person_id exists.
do $$ begin
  if to_regclass('public.pay_events') is not null then
    drop policy if exists pay_events_select_household_visible_v2754 on public.pay_events;
    create policy pay_events_select_household_visible_v2754 on public.pay_events
    for select to authenticated
    using (
      user_id = auth.uid()
      or (
        public.app_same_active_household(user_id)
        and (
          person_id is null
          or exists (select 1 from public.people p where p.id = pay_events.person_id and coalesce(p.income_visible_to_household, true) = true)
        )
      )
    );
  end if;
end $$;

do $$ begin
  if to_regclass('public.income_entries') is not null then
    drop policy if exists income_entries_select_household_visible_v2754 on public.income_entries;
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='income_entries' and column_name='person_id') then
      create policy income_entries_select_household_visible_v2754 on public.income_entries
      for select to authenticated
      using (
        user_id = auth.uid()
        or (
          public.app_same_active_household(user_id)
          and (
            person_id is null
            or exists (select 1 from public.people p where p.id = income_entries.person_id and coalesce(p.income_visible_to_household, true) = true)
          )
        )
      );
    else
      create policy income_entries_select_household_visible_v2754 on public.income_entries
      for select to authenticated
      using (user_id = auth.uid() or public.app_same_active_household(user_id));
    end if;
  end if;
end $$;

-- Costs/spending: require the related person to share costs where a person_id exists.
do $$ begin
  if to_regclass('public.planned_items') is not null then
    drop policy if exists planned_items_select_household_visible_v2754 on public.planned_items;
    create policy planned_items_select_household_visible_v2754 on public.planned_items
    for select to authenticated
    using (
      user_id = auth.uid()
      or (
        public.app_same_active_household(user_id)
        and (
          person_id is null
          or exists (
            select 1 from public.people p
            where p.id = planned_items.person_id
              and case when planned_items.direction = 'income' then coalesce(p.income_visible_to_household, true) else coalesce(p.costs_visible_to_household, true) end
          )
        )
      )
    );
  end if;
end $$;

do $$ begin
  if to_regclass('public.spending_entries') is not null then
    drop policy if exists spending_entries_select_household_visible_v2754 on public.spending_entries;
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='spending_entries' and column_name='person_id') then
      create policy spending_entries_select_household_visible_v2754 on public.spending_entries
      for select to authenticated
      using (
        user_id = auth.uid()
        or (
          public.app_same_active_household(user_id)
          and (
            person_id is null
            or exists (select 1 from public.people p where p.id = spending_entries.person_id and coalesce(p.costs_visible_to_household, true) = true)
          )
        )
      );
    else
      create policy spending_entries_select_household_visible_v2754 on public.spending_entries
      for select to authenticated
      using (user_id = auth.uid() or public.app_same_active_household(user_id));
    end if;
  end if;
end $$;

-- Household wealth summary assets. These do not have person-level visibility yet, so active household membership controls read access.
do $$
declare
  t text;
begin
  foreach t in array array[
    'financial_accounts','homes','home_valuation_sources','home_mortgage_deals',
    'pension_accounts','pension_funds','investment_accounts','investment_holdings','child_costs'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists %I on public.%I', t || '_select_household_v2754', t);
      if exists (select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='user_id') then
        execute format('create policy %I on public.%I for select to authenticated using (user_id = auth.uid() or public.app_same_active_household(user_id))', t || '_select_household_v2754', t);
      end if;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4) Nutrition allocation approval prompts
-- When food/drink is logged for a linked adult, the linked adult gets a real
-- notification and can keep/accept the entry into their own account.
-- ---------------------------------------------------------------------------

create table if not exists public.nutrition_allocation_claim_requests (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.app_households(id) on delete cascade,
  person_id uuid references public.people(id) on delete set null,
  source_user_id uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  requested_by_user_id uuid not null references auth.users(id) on delete cascade,
  food_log_ids uuid[] not null default '{}'::uuid[],
  label text,
  eaten_on date,
  status text not null default 'pending' check (status in ('pending','accepted','declined','expired','cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists nutrition_allocation_claim_target_idx on public.nutrition_allocation_claim_requests(target_user_id, status, created_at desc);

alter table public.nutrition_allocation_claim_requests enable row level security;

drop policy if exists nutrition_allocation_claim_select_involved_v2754 on public.nutrition_allocation_claim_requests;
create policy nutrition_allocation_claim_select_involved_v2754 on public.nutrition_allocation_claim_requests
for select to authenticated
using (target_user_id = auth.uid() or requested_by_user_id = auth.uid() or source_user_id = auth.uid());

create or replace function public.app_request_nutrition_allocation_claim(
  p_food_log_ids uuid[],
  p_person_id uuid,
  p_target_user_id uuid,
  p_label text default null,
  p_eaten_on date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user uuid := auth.uid();
  v_household_id uuid;
  v_request_id uuid;
  v_person_name text;
  v_source_email text;
begin
  if v_user is null then raise exception 'Sign in before requesting a nutrition allocation.'; end if;
  if p_target_user_id is null or p_target_user_id = v_user then return jsonb_build_object('ok', false, 'reason', 'no_external_target'); end if;
  if coalesce(array_length(p_food_log_ids, 1), 0) = 0 then return jsonb_build_object('ok', false, 'reason', 'no_logs'); end if;

  select p.name into v_person_name from public.people p where p.id = p_person_id;
  select email into v_source_email from auth.users where id = v_user;

  select viewer.household_id into v_household_id
  from public.app_household_members viewer
  join public.app_household_members target on target.household_id = viewer.household_id
  where viewer.user_id = v_user and target.user_id = p_target_user_id
    and coalesce(viewer.status, 'active') = 'active'
    and coalesce(target.status, 'active') = 'active'
  order by viewer.created_at asc
  limit 1;

  insert into public.nutrition_allocation_claim_requests(
    household_id, person_id, source_user_id, target_user_id, requested_by_user_id,
    food_log_ids, label, eaten_on, status, created_at, updated_at
  ) values (
    v_household_id, p_person_id, v_user, p_target_user_id, v_user,
    p_food_log_ids, nullif(p_label, ''), p_eaten_on, 'pending', now(), now()
  ) returning id into v_request_id;

  update public.food_logs
  set approval_status = 'pending', updated_at = now()
  where id = any(p_food_log_ids) and user_id = v_user;

  insert into public.app_notifications(
    user_id, household_id, notification_type, category, channel, action_status,
    severity, status, title, body, cta_label, cta_href, metadata, created_at
  ) values (
    p_target_user_id, v_household_id, 'nutrition_allocation_request', 'household', 'in_app', 'pending',
    'info', 'unread',
    'Food/drink logged for you',
    format('%s logged %s for %s. Keep it to add it to your own nutrition log, or decline if it is wrong.', coalesce(v_source_email, 'A household member'), coalesce(p_label, 'a food/drink entry'), coalesce(v_person_name, 'you')),
    'Review food log', '/notifications?tab=household',
    jsonb_build_object('nutrition_claim_request_id', v_request_id, 'food_log_ids', p_food_log_ids, 'person_id', p_person_id, 'label', p_label, 'eaten_on', p_eaten_on), now()
  );

  return jsonb_build_object('ok', true, 'request_id', v_request_id);
end;
$$;

grant execute on function public.app_request_nutrition_allocation_claim(uuid[], uuid, uuid, text, date) to authenticated;

create or replace function public.app_resolve_nutrition_allocation_claim(p_request_id uuid, p_decision text)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user uuid := auth.uid();
  v_request public.nutrition_allocation_claim_requests%rowtype;
  v_decision text := lower(coalesce(p_decision, ''));
  v_count int := 0;
begin
  if v_user is null then raise exception 'Sign in before responding to this food log.'; end if;
  if v_decision not in ('accept','accepted','keep','decline','declined','reject','rejected') then raise exception 'Choose accept or decline.'; end if;

  select * into v_request
  from public.nutrition_allocation_claim_requests
  where id = p_request_id
  for update;

  if v_request.id is null then raise exception 'Nutrition allocation request not found.'; end if;
  if v_request.target_user_id <> v_user then raise exception 'This food log request belongs to another user.'; end if;
  if v_request.status <> 'pending' then raise exception 'This food log request has already been answered.'; end if;

  if v_decision in ('accept','accepted','keep') then
    update public.food_logs
    set user_id = v_request.target_user_id,
        approval_status = 'accepted',
        updated_at = now()
    where id = any(v_request.food_log_ids)
      and user_id = v_request.source_user_id;
    get diagnostics v_count = row_count;

    update public.nutrition_allocation_claim_requests
    set status = 'accepted', responded_at = now(), updated_at = now()
    where id = v_request.id;

    update public.app_notifications
    set status = 'read', action_status = 'accepted', read_at = now()
    where user_id = v_user
      and notification_type = 'nutrition_allocation_request'
      and metadata->>'nutrition_claim_request_id' = v_request.id::text;

    return jsonb_build_object('ok', true, 'status', 'accepted', 'logs_moved', v_count);
  else
    update public.food_logs
    set approval_status = 'declined', updated_at = now()
    where id = any(v_request.food_log_ids)
      and user_id = v_request.source_user_id;

    update public.nutrition_allocation_claim_requests
    set status = 'declined', responded_at = now(), updated_at = now()
    where id = v_request.id;

    update public.app_notifications
    set status = 'dismissed', action_status = 'declined', read_at = now()
    where user_id = v_user
      and notification_type = 'nutrition_allocation_request'
      and metadata->>'nutrition_claim_request_id' = v_request.id::text;

    return jsonb_build_object('ok', true, 'status', 'declined');
  end if;
end;
$$;

grant execute on function public.app_resolve_nutrition_allocation_claim(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) Recreate profile handover resolver with constraint-safe account_status.
-- ---------------------------------------------------------------------------

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
      execute 'update public.food_logs set user_id = $1, approval_status = ''accepted'' where person_id = $2 and user_id = $3' using v_request.target_user_id, v_request.person_id, v_request.source_user_id;
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

create or replace function public.app_v2754_healthcheck()
returns table(check_name text, ok boolean, detail text)
language sql
security definer
set search_path = public
as $$
  select 'people_status_constraint', exists(select 1 from pg_constraint where conname = 'people_account_status_check'), 'people status constraint repaired' union all
  select 'households_status_constraint', exists(select 1 from pg_constraint where conname = 'app_households_status_check'), 'household status constraint repaired' union all
  select 'nutrition_claim_table', to_regclass('public.nutrition_allocation_claim_requests') is not null, 'nutrition claim table exists' union all
  select 'nutrition_request_rpc', to_regprocedure('public.app_request_nutrition_allocation_claim(uuid[],uuid,uuid,text,date)') is not null, 'nutrition allocation request RPC exists' union all
  select 'nutrition_resolve_rpc', to_regprocedure('public.app_resolve_nutrition_allocation_claim(uuid,text)') is not null, 'nutrition allocation resolve RPC exists' union all
  select 'same_household_rpc', to_regprocedure('public.app_same_active_household(uuid)') is not null, 'household sharing helper exists';
$$;

grant execute on function public.app_v2754_healthcheck() to authenticated;

notify pgrst, 'reload schema';
