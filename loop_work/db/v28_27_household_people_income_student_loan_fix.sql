-- v28.27 - household people, income and student-loan repair
-- Fixes duplicate adult profiles, missing household children in selectors/tree, shared student loans and records still tied to older person rows.

create extension if not exists pgcrypto;


-- Make guardian links household-aware even if v28.26 has not been run yet.
alter table public.person_guardians add column if not exists household_id uuid references public.app_households(id) on delete set null;
alter table public.person_guardians add column if not exists owner_user_id uuid references auth.users(id) on delete set null;
alter table public.person_guardians add column if not exists created_by_user_id uuid references auth.users(id) on delete set null;
alter table public.person_guardians add column if not exists visibility_scope text not null default 'private';

-- Student loan balances need the same household visibility model as income/spending.
alter table public.student_loan_accounts add column if not exists household_id uuid references public.app_households(id) on delete set null;
alter table public.student_loan_accounts add column if not exists owner_user_id uuid references auth.users(id) on delete set null;
alter table public.student_loan_accounts add column if not exists created_by_user_id uuid references auth.users(id) on delete set null;
alter table public.student_loan_accounts add column if not exists visibility_scope text not null default 'private';
create index if not exists student_loan_accounts_household_scope_idx on public.student_loan_accounts(household_id, visibility_scope);
create index if not exists student_loan_accounts_person_idx on public.student_loan_accounts(person_id);

update public.student_loan_accounts r
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
 where r.user_id is not null;

-- Reattach orphaned people to their active household and make household children visible to both adults.
update public.people p
   set household_id = coalesce(
         p.household_id,
         (select prof.household_id from public.app_user_profiles prof where prof.user_id = p.user_id and prof.household_id is not null limit 1),
         (select hm.household_id from public.app_household_members hm where hm.user_id = p.user_id and coalesce(hm.status, 'active') = 'active' order by hm.created_at asc limit 1)
       ),
       owner_user_id = coalesce(p.owner_user_id, p.user_id),
       created_by_user_id = coalesce(p.created_by_user_id, p.user_id),
       visibility_scope = case
         when coalesce(
           p.household_id,
           (select prof.household_id from public.app_user_profiles prof where prof.user_id = p.user_id and prof.household_id is not null limit 1),
           (select hm.household_id from public.app_household_members hm where hm.user_id = p.user_id and coalesce(hm.status, 'active') = 'active' order by hm.created_at asc limit 1)
         ) is not null then 'household'
         else coalesce(nullif(p.visibility_scope, ''), 'private')
       end,
       updated_at = now()
 where p.user_id is not null
   and coalesce(p.account_status, '') <> 'duplicate_merged';

-- Build a canonical person map for duplicate children/adults inside one household.
drop table if exists pg_temp.loop_v2827_people_merge_map;
create temp table loop_v2827_people_merge_map on commit drop as
with keyed as (
  select
    p.id,
    p.household_id,
    case
      when coalesce(p.relationship, '') = 'child' then 'child:' || lower(trim(p.name)) || ':' || coalesce(p.birth_date::text, 'unknown')
      when coalesce(p.linked_user_id::text, '') <> '' then 'linked:' || p.linked_user_id::text
      when coalesce(p.email, p.invite_email, '') <> '' then 'email:' || lower(coalesce(p.email, p.invite_email))
      else 'adult:' || coalesce(p.relationship, 'other') || ':' || lower(trim(p.name))
    end as identity_key,
    row_number() over (
      partition by p.household_id,
        case
          when coalesce(p.relationship, '') = 'child' then 'child:' || lower(trim(p.name)) || ':' || coalesce(p.birth_date::text, 'unknown')
          when coalesce(p.linked_user_id::text, '') <> '' then 'linked:' || p.linked_user_id::text
          when coalesce(p.email, p.invite_email, '') <> '' then 'email:' || lower(coalesce(p.email, p.invite_email))
          else 'adult:' || coalesce(p.relationship, 'other') || ':' || lower(trim(p.name))
        end
      order by
        case when p.linked_user_id is not null then 0 else 1 end,
        case when p.relationship in ('self','partner') then 0 else 1 end,
        p.created_at asc nulls last,
        p.id asc
    ) as rn,
    first_value(p.id) over (
      partition by p.household_id,
        case
          when coalesce(p.relationship, '') = 'child' then 'child:' || lower(trim(p.name)) || ':' || coalesce(p.birth_date::text, 'unknown')
          when coalesce(p.linked_user_id::text, '') <> '' then 'linked:' || p.linked_user_id::text
          when coalesce(p.email, p.invite_email, '') <> '' then 'email:' || lower(coalesce(p.email, p.invite_email))
          else 'adult:' || coalesce(p.relationship, 'other') || ':' || lower(trim(p.name))
        end
      order by
        case when p.linked_user_id is not null then 0 else 1 end,
        case when p.relationship in ('self','partner') then 0 else 1 end,
        p.created_at asc nulls last,
        p.id asc
    ) as canonical_id
  from public.people p
  where p.household_id is not null
    and coalesce(p.account_status, '') <> 'duplicate_merged'
    and p.active_until is null
    and trim(coalesce(p.name, '')) <> ''
)
select id as duplicate_id, canonical_id
from keyed
where rn > 1 and id <> canonical_id;

-- Repoint common person references to the canonical rows.
do $$
declare
  t text;
begin
  foreach t in array array[
    'pay_events','income_entries','spending_entries','planned_items','assets','liabilities','deal_bills','meals','meal_logs','food_logs',
    'home_owners','pension_accounts','investment_accounts','student_loan_accounts','bank_imports','bank_transactions','bank_regular_payment_candidates'
  ] loop
    if to_regclass(format('public.%I', t)) is not null
       and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'person_id') then
      execute format('update public.%I r set person_id = m.canonical_id from pg_temp.loop_v2827_people_merge_map m where r.person_id = m.duplicate_id', t);
    end if;
  end loop;

  foreach t in array array['child_costs','person_guardians'] loop
    if to_regclass(format('public.%I', t)) is not null
       and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'child_id') then
      execute format('update public.%I r set child_id = m.canonical_id from pg_temp.loop_v2827_people_merge_map m where r.child_id = m.duplicate_id', t);
    end if;
    if to_regclass(format('public.%I', t)) is not null
       and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'child_person_id') then
      execute format('update public.%I r set child_person_id = m.canonical_id from pg_temp.loop_v2827_people_merge_map m where r.child_person_id = m.duplicate_id', t);
    end if;
    if to_regclass(format('public.%I', t)) is not null
       and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'guardian_person_id') then
      execute format('update public.%I r set guardian_person_id = m.canonical_id from pg_temp.loop_v2827_people_merge_map m where r.guardian_person_id = m.duplicate_id', t);
    end if;
  end loop;
end $$;

update public.people p
   set account_status = 'duplicate_merged',
       active_until = coalesce(active_until, current_date),
       notes = concat_ws(E'\n', nullif(notes, ''), 'Merged into canonical household person profile on v28.27 household people repair.'),
       updated_at = now()
  from pg_temp.loop_v2827_people_merge_map m
 where p.id = m.duplicate_id;

-- If a household has adults and children but no guardian links, link each child to active adult profiles for display and filtering.
insert into public.person_guardians(user_id, guardian_person_id, child_person_id, relationship_type, household_id, visibility_scope, owner_user_id, created_by_user_id)
select
  coalesce(a.user_id, c.user_id),
  a.id,
  c.id,
  'guardian',
  c.household_id,
  'household',
  coalesce(a.owner_user_id, a.user_id, c.user_id),
  coalesce(a.created_by_user_id, a.user_id, c.user_id)
from public.people c
join public.people a on a.household_id = c.household_id and coalesce(a.relationship, '') in ('self','partner') and a.active_until is null and coalesce(a.account_status, '') <> 'duplicate_merged'
where coalesce(c.relationship, '') = 'child'
  and c.active_until is null
  and coalesce(c.account_status, '') <> 'duplicate_merged'
  and not exists (
    select 1 from public.person_guardians g where g.child_person_id = c.id and g.guardian_person_id = a.id
  );

alter table public.student_loan_accounts enable row level security;
drop policy if exists student_loan_accounts_select_own on public.student_loan_accounts;
drop policy if exists student_loan_accounts_insert_own on public.student_loan_accounts;
drop policy if exists student_loan_accounts_update_own on public.student_loan_accounts;
drop policy if exists student_loan_accounts_delete_own on public.student_loan_accounts;
drop policy if exists loop_student_loan_scope_select_v2827 on public.student_loan_accounts;
drop policy if exists loop_student_loan_scope_insert_v2827 on public.student_loan_accounts;
drop policy if exists loop_student_loan_scope_update_v2827 on public.student_loan_accounts;
drop policy if exists loop_student_loan_scope_delete_v2827 on public.student_loan_accounts;

create policy loop_student_loan_scope_select_v2827 on public.student_loan_accounts
for select to authenticated
using (
  user_id = auth.uid()
  or (
    household_id is not null
    and visibility_scope = 'household'
    and public.loop_is_active_household_member(household_id, auth.uid())
  )
);

create policy loop_student_loan_scope_insert_v2827 on public.student_loan_accounts
for insert to authenticated
with check (
  user_id = auth.uid()
  and (
    household_id is null
    or public.loop_is_active_household_member(household_id, auth.uid())
  )
);

create policy loop_student_loan_scope_update_v2827 on public.student_loan_accounts
for update to authenticated
using (
  user_id = auth.uid()
  or (household_id is not null and public.loop_can_manage_household(household_id, auth.uid()))
)
with check (
  user_id = auth.uid()
  or (household_id is not null and public.loop_can_manage_household(household_id, auth.uid()))
);

create policy loop_student_loan_scope_delete_v2827 on public.student_loan_accounts
for delete to authenticated
using (
  user_id = auth.uid()
  or (household_id is not null and public.loop_can_manage_household(household_id, auth.uid()))
);

select pg_notify('pgrst', 'reload schema');
