-- v28.28 - income edit/allocation repair
-- Makes income records person-owned/editable, and repairs legacy rows that appeared as Household.

create extension if not exists pgcrypto;

-- Defensive: columns should already exist from v28.26/v28.27, but keep this migration standalone.
alter table if exists public.income_entries add column if not exists household_id uuid references public.app_households(id) on delete set null;
alter table if exists public.income_entries add column if not exists owner_user_id uuid references auth.users(id) on delete set null;
alter table if exists public.income_entries add column if not exists created_by_user_id uuid references auth.users(id) on delete set null;
alter table if exists public.income_entries add column if not exists visibility_scope text not null default 'private';

alter table if exists public.pay_events add column if not exists household_id uuid references public.app_households(id) on delete set null;
alter table if exists public.pay_events add column if not exists owner_user_id uuid references auth.users(id) on delete set null;
alter table if exists public.pay_events add column if not exists created_by_user_id uuid references auth.users(id) on delete set null;
alter table if exists public.pay_events add column if not exists visibility_scope text not null default 'private';

alter table if exists public.student_loan_accounts add column if not exists household_id uuid references public.app_households(id) on delete set null;
alter table if exists public.student_loan_accounts add column if not exists owner_user_id uuid references auth.users(id) on delete set null;
alter table if exists public.student_loan_accounts add column if not exists created_by_user_id uuid references auth.users(id) on delete set null;
alter table if exists public.student_loan_accounts add column if not exists visibility_scope text not null default 'private';

-- Ensure scope fields are populated before person repair.
do $$
declare
  t text;
begin
  foreach t in array array['income_entries','pay_events','student_loan_accounts'] loop
    if to_regclass(format('public.%I', t)) is not null then
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
      $fmt$, t);
    end if;
  end loop;
end $$;

-- Repair legacy pay/manual income/student-loan rows that had no person_id and therefore showed as Household.
-- The safest default is the active adult profile linked to the row user/owner. This will assign Dan's old salary rows to Dan.
-- v28.28.1 note: use correlated SET subqueries instead of UPDATE ... FROM LATERAL, because
-- PostgreSQL does not allow the target table alias to be referenced inside that FROM item.

update public.pay_events r
   set person_id = (
    select person.id
      from public.people person
     where person.active_until is null
       and coalesce(person.account_status, '') <> 'duplicate_merged'
       and coalesce(person.relationship, '') in ('self','partner','other')
       and (
         (r.household_id is not null and person.household_id = r.household_id)
         or (r.household_id is null and person.user_id = r.user_id)
       )
       and (
         person.linked_user_id = coalesce(r.owner_user_id, r.user_id)
         or person.user_id = coalesce(r.owner_user_id, r.user_id)
         or person.linked_user_id = r.user_id
         or person.user_id = r.user_id
         or person.relationship = 'self'
       )
     order by
       case when person.linked_user_id = coalesce(r.owner_user_id, r.user_id) or person.user_id = coalesce(r.owner_user_id, r.user_id) then 0 else 1 end,
       case when person.relationship = 'self' then 0 else 1 end,
       person.created_at asc nulls last,
       person.id asc
     limit 1
   )
 where r.person_id is null
   and exists (
    select 1
      from public.people person
     where person.active_until is null
       and coalesce(person.account_status, '') <> 'duplicate_merged'
       and coalesce(person.relationship, '') in ('self','partner','other')
       and (
         (r.household_id is not null and person.household_id = r.household_id)
         or (r.household_id is null and person.user_id = r.user_id)
       )
       and (
         person.linked_user_id = coalesce(r.owner_user_id, r.user_id)
         or person.user_id = coalesce(r.owner_user_id, r.user_id)
         or person.linked_user_id = r.user_id
         or person.user_id = r.user_id
         or person.relationship = 'self'
       )
   );

update public.income_entries r
   set person_id = (
    select person.id
      from public.people person
     where person.active_until is null
       and coalesce(person.account_status, '') <> 'duplicate_merged'
       and coalesce(person.relationship, '') in ('self','partner','other')
       and (
         (r.household_id is not null and person.household_id = r.household_id)
         or (r.household_id is null and person.user_id = r.user_id)
       )
       and (
         person.linked_user_id = coalesce(r.owner_user_id, r.user_id)
         or person.user_id = coalesce(r.owner_user_id, r.user_id)
         or person.linked_user_id = r.user_id
         or person.user_id = r.user_id
         or person.relationship = 'self'
       )
     order by
       case when person.linked_user_id = coalesce(r.owner_user_id, r.user_id) or person.user_id = coalesce(r.owner_user_id, r.user_id) then 0 else 1 end,
       case when person.relationship = 'self' then 0 else 1 end,
       person.created_at asc nulls last,
       person.id asc
     limit 1
   )
 where r.person_id is null
   and exists (
    select 1
      from public.people person
     where person.active_until is null
       and coalesce(person.account_status, '') <> 'duplicate_merged'
       and coalesce(person.relationship, '') in ('self','partner','other')
       and (
         (r.household_id is not null and person.household_id = r.household_id)
         or (r.household_id is null and person.user_id = r.user_id)
       )
       and (
         person.linked_user_id = coalesce(r.owner_user_id, r.user_id)
         or person.user_id = coalesce(r.owner_user_id, r.user_id)
         or person.linked_user_id = r.user_id
         or person.user_id = r.user_id
         or person.relationship = 'self'
       )
   );

update public.student_loan_accounts r
   set person_id = (
    select person.id
      from public.people person
     where person.active_until is null
       and coalesce(person.account_status, '') <> 'duplicate_merged'
       and coalesce(person.relationship, '') in ('self','partner','other')
       and (
         (r.household_id is not null and person.household_id = r.household_id)
         or (r.household_id is null and person.user_id = r.user_id)
       )
       and (
         person.linked_user_id = coalesce(r.owner_user_id, r.user_id)
         or person.user_id = coalesce(r.owner_user_id, r.user_id)
         or person.linked_user_id = r.user_id
         or person.user_id = r.user_id
         or person.relationship = 'self'
       )
     order by
       case when person.linked_user_id = coalesce(r.owner_user_id, r.user_id) or person.user_id = coalesce(r.owner_user_id, r.user_id) then 0 else 1 end,
       case when person.relationship = 'self' then 0 else 1 end,
       person.created_at asc nulls last,
       person.id asc
     limit 1
   )
 where r.person_id is null
   and exists (
    select 1
      from public.people person
     where person.active_until is null
       and coalesce(person.account_status, '') <> 'duplicate_merged'
       and coalesce(person.relationship, '') in ('self','partner','other')
       and (
         (r.household_id is not null and person.household_id = r.household_id)
         or (r.household_id is null and person.user_id = r.user_id)
       )
       and (
         person.linked_user_id = coalesce(r.owner_user_id, r.user_id)
         or person.user_id = coalesce(r.owner_user_id, r.user_id)
         or person.linked_user_id = r.user_id
         or person.user_id = r.user_id
         or person.relationship = 'self'
       )
   );

create index if not exists pay_events_person_scope_v2828_idx on public.pay_events(person_id, household_id, visibility_scope);
create index if not exists income_entries_person_scope_v2828_idx on public.income_entries(person_id, household_id, visibility_scope);
create index if not exists student_loan_accounts_person_scope_v2828_idx on public.student_loan_accounts(person_id, household_id, visibility_scope);

select pg_notify('pgrst', 'reload schema');
