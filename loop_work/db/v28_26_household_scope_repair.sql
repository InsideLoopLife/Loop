-- v28.26 - household scope repair
-- Restores household-visible data across partner accounts, children/dependants, income, spending, accounts and property.
-- Key principle: created_by, owner, subject and visible household are separate fields.

create extension if not exists pgcrypto;

create or replace function public.loop_is_active_household_member(p_household_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_household_members m
    where m.household_id = p_household_id
      and m.user_id = p_user_id
      and coalesce(m.status, 'active') = 'active'
  );
$$;

create or replace function public.loop_can_manage_household(p_household_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_household_members m
    where m.household_id = p_household_id
      and m.user_id = p_user_id
      and coalesce(m.status, 'active') = 'active'
      and (
        coalesce(m.permission_tier, m.role, '') in ('owner', 'admin', 'parent_admin')
        or coalesce(m.can_manage_people, false)
        or coalesce(m.can_manage_household_costs, false)
      )
  );
$$;

grant execute on function public.loop_is_active_household_member(uuid, uuid) to authenticated;
grant execute on function public.loop_can_manage_household(uuid, uuid) to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'people',
    'person_guardians',
    'income_entries',
    'pay_events',
    'spending_categories',
    'spending_entries',
    'planned_items',
    'child_costs',
    'bank_imports',
    'bank_transactions',
    'bank_regular_payment_candidates',
    'financial_accounts',
    'account_balance_snapshots',
    'financial_profiles',
    'assets',
    'liabilities',
    'homes',
    'home_owners',
    'home_mortgage_deals',
    'home_valuation_sources',
    'pension_accounts',
    'pension_funds',
    'investment_accounts',
    'investment_holdings',
    'deal_bills',
    'grocery_supermarkets',
    'meals',
    'meal_logs',
    'food_logs'
  ] loop
    if to_regclass(format('public.%I', t)) is not null
       and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'user_id') then
      execute format('alter table public.%I add column if not exists household_id uuid references public.app_households(id) on delete set null', t);
      execute format('alter table public.%I add column if not exists owner_user_id uuid references auth.users(id) on delete set null', t);
      execute format('alter table public.%I add column if not exists created_by_user_id uuid references auth.users(id) on delete set null', t);
      execute format('alter table public.%I add column if not exists visibility_scope text not null default ''private''', t);
      execute format('create index if not exists %I on public.%I(user_id)', t || '_user_scope_idx', t);
      execute format('create index if not exists %I on public.%I(household_id, visibility_scope)', t || '_household_scope_idx', t);
    end if;
  end loop;
end $$;

-- Repair old rows that were only owned by a single account/admin record, making them visible to the active household.
do $$
declare
  t text;
begin
  foreach t in array array[
    'people','person_guardians','income_entries','pay_events','spending_categories','spending_entries','planned_items','child_costs',
    'bank_imports','bank_transactions','bank_regular_payment_candidates','financial_accounts','account_balance_snapshots','financial_profiles',
    'assets','liabilities','homes','home_owners','home_mortgage_deals','home_valuation_sources',
    'pension_accounts','pension_funds','investment_accounts','investment_holdings','deal_bills','grocery_supermarkets','meals','meal_logs','food_logs'
  ] loop
    if to_regclass(format('public.%I', t)) is not null
       and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'user_id') then
      execute format($fmt$
        update public.%I r
           set owner_user_id = coalesce(r.owner_user_id, r.user_id),
               created_by_user_id = coalesce(r.created_by_user_id, r.user_id),
               household_id = coalesce(
                 r.household_id,
                 (select p.household_id from public.app_user_profiles p where p.user_id = r.user_id and p.household_id is not null limit 1),
                 (select m.household_id from public.app_household_members m where m.user_id = r.user_id and coalesce(m.status, 'active') = 'active' order by m.created_at asc limit 1)
               ),
               visibility_scope = case
                 when coalesce(r.visibility_scope, 'private') = 'private'
                  and coalesce(
                    r.household_id,
                    (select p.household_id from public.app_user_profiles p where p.user_id = r.user_id and p.household_id is not null limit 1),
                    (select m.household_id from public.app_household_members m where m.user_id = r.user_id and coalesce(m.status, 'active') = 'active' order by m.created_at asc limit 1)
                  ) is not null
                 then 'household'
                 else coalesce(nullif(r.visibility_scope, ''), 'private')
               end
         where r.user_id is not null
           and (
             r.owner_user_id is null
             or r.created_by_user_id is null
             or r.household_id is null
             or coalesce(r.visibility_scope, 'private') = 'private'
           )
      $fmt$, t);
    end if;
  end loop;
end $$;

-- Ensure existing invited/linked people are attached to their household, not just to the account that created them.
update public.people p
   set household_id = coalesce(
         p.household_id,
         (select prof.household_id from public.app_user_profiles prof where prof.user_id = p.user_id and prof.household_id is not null limit 1),
         (select hm.household_id from public.app_household_members hm where hm.user_id = p.user_id and coalesce(hm.status, 'active') = 'active' order by hm.created_at asc limit 1)
       ),
       visibility_scope = 'household',
       owner_user_id = coalesce(p.owner_user_id, p.user_id),
       created_by_user_id = coalesce(p.created_by_user_id, p.user_id),
       updated_at = coalesce(p.updated_at, now())
 where coalesce(
         p.household_id,
         (select prof.household_id from public.app_user_profiles prof where prof.user_id = p.user_id and prof.household_id is not null limit 1),
         (select hm.household_id from public.app_household_members hm where hm.user_id = p.user_id and coalesce(hm.status, 'active') = 'active' order by hm.created_at asc limit 1)
       ) is not null;

-- Merge duplicate children within the same household by name + birth date, preserving the oldest canonical row.
drop table if exists pg_temp.loop_people_merge_map;
create temp table loop_people_merge_map on commit drop as
with ranked as (
  select
    id,
    first_value(id) over (partition by household_id, lower(trim(name)), coalesce(birth_date, date '1900-01-01'), relationship order by created_at asc nulls last, id asc) as canonical_id,
    row_number() over (partition by household_id, lower(trim(name)), coalesce(birth_date, date '1900-01-01'), relationship order by created_at asc nulls last, id asc) as rn
  from public.people
  where household_id is not null
    and relationship = 'child'
    and coalesce(account_status, '') <> 'duplicate_merged'
)
select id as duplicate_id, canonical_id
from ranked
where rn > 1;

do $$
declare
  t text;
begin
  foreach t in array array['pay_events','income_entries','spending_entries','planned_items','assets','liabilities','deal_bills','meals','home_owners','pension_accounts','investment_accounts','person_guardians'] loop
    if to_regclass(format('public.%I', t)) is not null
       and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'person_id') then
      execute format('update public.%I r set person_id = m.canonical_id from pg_temp.loop_people_merge_map m where r.person_id = m.duplicate_id', t);
    end if;
  end loop;

  foreach t in array array['child_costs','person_guardians'] loop
    if to_regclass(format('public.%I', t)) is not null
       and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'child_id') then
      execute format('update public.%I r set child_id = m.canonical_id from pg_temp.loop_people_merge_map m where r.child_id = m.duplicate_id', t);
    end if;
    if to_regclass(format('public.%I', t)) is not null
       and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'child_person_id') then
      execute format('update public.%I r set child_person_id = m.canonical_id from pg_temp.loop_people_merge_map m where r.child_person_id = m.duplicate_id', t);
    end if;
  end loop;
end $$;

update public.people p
   set account_status = 'duplicate_merged',
       active_until = coalesce(active_until, current_date),
       notes = concat_ws(E'\n', nullif(notes, ''), 'Merged into canonical household child profile on v28.26 household scope repair.'),
       updated_at = now()
  from pg_temp.loop_people_merge_map m
 where p.id = m.duplicate_id;

create unique index if not exists people_household_active_child_dedupe_uidx
  on public.people(household_id, lower(trim(name)), coalesce(birth_date, date '1900-01-01'))
  where relationship = 'child' and coalesce(account_status, '') <> 'duplicate_merged' and household_id is not null;

-- Select/update/delete RLS: own rows remain private; household rows are readable to active members when visibility_scope = household.
do $$
declare
  t text;
begin
  foreach t in array array[
    'people','person_guardians','income_entries','pay_events','spending_categories','spending_entries','planned_items','child_costs',
    'bank_imports','bank_transactions','bank_regular_payment_candidates','financial_accounts','account_balance_snapshots','financial_profiles',
    'assets','liabilities','homes','home_owners','home_mortgage_deals','home_valuation_sources',
    'pension_accounts','pension_funds','investment_accounts','investment_holdings','deal_bills','grocery_supermarkets','meals','meal_logs','food_logs'
  ] loop
    if to_regclass(format('public.%I', t)) is not null
       and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'user_id') then
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists loop_household_scope_select_v2826 on public.%I', t);
      execute format('drop policy if exists loop_household_scope_insert_v2826 on public.%I', t);
      execute format('drop policy if exists loop_household_scope_update_v2826 on public.%I', t);
      execute format('drop policy if exists loop_household_scope_delete_v2826 on public.%I', t);

      execute format($fmt$
        create policy loop_household_scope_select_v2826 on public.%I
        for select to authenticated
        using (
          user_id = auth.uid()
          or (
            household_id is not null
            and visibility_scope = 'household'
            and public.loop_is_active_household_member(household_id, auth.uid())
          )
        )
      $fmt$, t);

      execute format($fmt$
        create policy loop_household_scope_insert_v2826 on public.%I
        for insert to authenticated
        with check (
          user_id = auth.uid()
          and (
            household_id is null
            or public.loop_is_active_household_member(household_id, auth.uid())
          )
        )
      $fmt$, t);

      execute format($fmt$
        create policy loop_household_scope_update_v2826 on public.%I
        for update to authenticated
        using (
          user_id = auth.uid()
          or (household_id is not null and public.loop_can_manage_household(household_id, auth.uid()))
        )
        with check (
          user_id = auth.uid()
          or (household_id is not null and public.loop_can_manage_household(household_id, auth.uid()))
        )
      $fmt$, t);

      execute format($fmt$
        create policy loop_household_scope_delete_v2826 on public.%I
        for delete to authenticated
        using (
          user_id = auth.uid()
          or (household_id is not null and public.loop_can_manage_household(household_id, auth.uid()))
        )
      $fmt$, t);
    end if;
  end loop;
end $$;

create or replace function public.app_share_my_history_with_household(
  p_household_id uuid,
  p_share_mode text default 'all',
  p_from_date date default null,
  p_categories text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user uuid := auth.uid();
  v_mode text := lower(coalesce(p_share_mode, 'none'));
  v_categories text[] := coalesce(p_categories, array[]::text[]);
  v_count integer := 0;
  v_total integer := 0;
  rec record;
  v_cutoff date;
  v_date_col text;
  v_sql text;
begin
  if v_user is null then raise exception 'Sign in before sharing household data.'; end if;
  if p_household_id is null then raise exception 'Missing household id.'; end if;
  if not public.loop_is_active_household_member(p_household_id, v_user) then raise exception 'You are not an active member of that household.'; end if;
  if v_mode = 'none' then
    return jsonb_build_object('ok', true, 'shared_rows', 0, 'mode', v_mode);
  end if;
  if array_length(v_categories, 1) is null then
    return jsonb_build_object('ok', true, 'shared_rows', 0, 'mode', v_mode, 'reason', 'no_categories_selected');
  end if;

  v_cutoff := case
    when v_mode = 'today' then current_date
    when v_mode = 'from_date' then coalesce(p_from_date, current_date)
    else null
  end;

  for rec in
    select * from (values
      ('people','people','active_from'),
      ('person_guardians','people','created_at'),
      ('income_entries','income','entry_date'),
      ('pay_events','income','effective_from'),
      ('spending_categories','spending','created_at'),
      ('spending_entries','spending','spent_at'),
      ('planned_items','spending','start_date'),
      ('child_costs','spending','starts_on'),
      ('bank_imports','spending','created_at'),
      ('bank_transactions','spending','transaction_date'),
      ('bank_regular_payment_candidates','spending','first_seen'),
      ('financial_accounts','accounts','created_at'),
      ('account_balance_snapshots','accounts','snapshot_date'),
      ('financial_profiles','accounts','created_at'),
      ('homes','property','created_at'),
      ('home_owners','property','created_at'),
      ('home_mortgage_deals','property','start_date'),
      ('home_valuation_sources','property','valuation_date'),
      ('assets','net_worth','created_at'),
      ('liabilities','net_worth','created_at'),
      ('pension_accounts','net_worth','created_at'),
      ('pension_funds','net_worth','created_at'),
      ('investment_accounts','net_worth','created_at'),
      ('investment_holdings','net_worth','created_at'),
      ('deal_bills','lifestyle','contract_start'),
      ('grocery_supermarkets','lifestyle','created_at'),
      ('meals','lifestyle','created_at')
    ) as m(table_name, category, date_col)
    where m.category = any(v_categories)
  loop
    if to_regclass(format('public.%I', rec.table_name)) is null
       or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = rec.table_name and column_name = 'user_id') then
      continue;
    end if;

    v_date_col := case
      when v_cutoff is null then null
      when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = rec.table_name and column_name = rec.date_col) then rec.date_col
      when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = rec.table_name and column_name = 'created_at') then 'created_at'
      else null
    end;

    v_sql := format(
      'update public.%I set household_id = $1, visibility_scope = ''household'', owner_user_id = coalesce(owner_user_id, user_id), created_by_user_id = coalesce(created_by_user_id, user_id) where user_id = $2',
      rec.table_name
    );

    if v_cutoff is not null and v_date_col is not null then
      v_sql := v_sql || format(' and %I::date >= $3', v_date_col);
      execute v_sql using p_household_id, v_user, v_cutoff;
    elsif v_cutoff is null then
      execute v_sql using p_household_id, v_user;
    else
      -- Tables with no reliable date column should not leak old history for today/from-date modes.
      continue;
    end if;

    get diagnostics v_count = row_count;
    v_total := v_total + coalesce(v_count, 0);
  end loop;

  return jsonb_build_object('ok', true, 'household_id', p_household_id, 'shared_rows', v_total, 'mode', v_mode, 'categories', v_categories);
end;
$$;

grant execute on function public.app_share_my_history_with_household(uuid, text, date, text[]) to authenticated;

-- Rebuild invite acceptance so an accepting partner becomes an active member, can claim a pre-created partner profile,
-- and can then choose data sharing from the application screen.
drop function if exists public.app_accept_household_invite(text, uuid);
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
  v_invite public.household_join_invites%rowtype;
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
  from public.household_join_invites
  where status = 'pending'
    and (
      (p_invite_id is not null and id = p_invite_id)
      or (p_token is not null and length(trim(p_token)) <= 16 and upper(short_code) = upper(trim(p_token)))
      or (p_token is not null and length(trim(p_token)) > 16 and token_hash = encode(digest(trim(p_token), 'sha256'), 'hex'))
    )
  order by created_at desc
  limit 1
  for update;

  if v_invite.id is null then raise exception 'Invite not found or already used.'; end if;
  if v_invite.expires_at < now() then
    update public.household_join_invites set status = 'expired', updated_at = now() where id = v_invite.id;
    raise exception 'This invite has expired. Ask for a fresh household invite.';
  end if;

  if coalesce(v_invite.invited_email, '') <> '' and lower(v_invite.invited_email) <> v_email then
    raise exception 'This invite was sent to %. Sign in with that email to accept it.', v_invite.invited_email;
  end if;
  if coalesce(v_invite.invited_email_hash, '') <> '' and v_invite.invited_email_hash <> encode(digest(v_email, 'sha256'), 'hex') then
    raise exception 'This invite was sent to a different email address.';
  end if;

  select owner_user_id, name into v_owner_user_id, v_household_name
  from public.app_households
  where id = v_invite.household_id;

  if v_owner_user_id is null then raise exception 'Household not found.'; end if;

  v_tier := coalesce(nullif(v_invite.permission_tier, ''), 'member');
  v_role := coalesce(nullif(v_invite.role, ''), 'member');

  insert into public.app_household_members(
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

  update public.household_join_invites
     set status = 'accepted', accepted_user_id = v_user, accepted_at = now(), updated_at = now()
   where id = v_invite.id;

  insert into public.app_user_profiles(user_id, email, household_id, updated_at)
  values (v_user, nullif(v_email, ''), v_invite.household_id, now())
  on conflict (user_id) do update set
    household_id = excluded.household_id,
    email = coalesce(app_user_profiles.email, excluded.email),
    updated_at = now();

  if v_email <> '' then
    update public.people p
       set linked_user_id = v_user,
           email = coalesce(nullif(p.email, ''), v_email),
           invite_email = coalesce(nullif(p.invite_email, ''), v_email),
           account_status = 'linked',
           household_id = v_invite.household_id,
           visibility_scope = 'household',
           owner_user_id = coalesce(p.owner_user_id, p.user_id),
           created_by_user_id = coalesce(p.created_by_user_id, p.user_id),
           updated_at = now()
     where p.household_id = v_invite.household_id
       and coalesce(p.relationship, '') <> 'child'
       and (p.linked_user_id is null or p.linked_user_id = v_user)
       and (lower(coalesce(p.email, '')) = v_email or lower(coalesce(p.invite_email, '')) = v_email)
     returning p.id into v_linked_person_id;
  end if;

  if v_linked_person_id is null then
    update public.people p
       set linked_user_id = v_user,
           email = coalesce(nullif(p.email, ''), nullif(v_email, '')),
           invite_email = coalesce(nullif(p.invite_email, ''), nullif(v_email, '')),
           account_status = 'linked',
           household_id = v_invite.household_id,
           visibility_scope = 'household',
           owner_user_id = coalesce(p.owner_user_id, p.user_id),
           created_by_user_id = coalesce(p.created_by_user_id, p.user_id),
           updated_at = now()
     where p.user_id = v_user
       and (p.linked_user_id = v_user or p.relationship = 'self' or lower(coalesce(p.email, '')) = v_email or lower(coalesce(p.invite_email, '')) = v_email)
     returning p.id into v_linked_person_id;
  end if;

  if v_linked_person_id is null then
    select coalesce(nullif(display_name, ''), nullif(full_name, ''), split_part(v_email, '@', 1), 'Household member')
      into v_profile_name
    from public.app_user_profiles
    where user_id = v_user;

    insert into public.people(
      user_id, owner_user_id, created_by_user_id, household_id, visibility_scope,
      linked_user_id, name, relationship, email, invite_email, account_status,
      income_visible_to_household, costs_visible_to_household, household_can_add_costs,
      active_from, updated_at
    ) values (
      v_user, v_user, v_user, v_invite.household_id, 'household',
      v_user, coalesce(v_profile_name, 'Household member'), 'self', nullif(v_email, ''), nullif(v_email, ''), 'linked',
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

select pg_notify('pgrst', 'reload schema');
