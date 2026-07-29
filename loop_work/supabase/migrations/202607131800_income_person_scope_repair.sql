begin;

-- Reattach income records that still point at older duplicate household people.
-- This does not delete or merge income rows: two jobs for one person remain two jobs.
drop table if exists pg_temp.loop_v2886_income_people_map;
create temp table loop_v2886_income_people_map on commit drop as
with keyed as (
  select
    p.id,
    p.household_id,
    case
      when p.linked_user_id is not null then 'linked:' || p.linked_user_id::text
      when nullif(lower(trim(coalesce(p.email, p.invite_email, ''))), '') is not null
        then 'email:' || lower(trim(coalesce(p.email, p.invite_email)))
      else 'person:' || lower(trim(coalesce(p.name, ''))) || ':' || coalesce(p.relationship, 'other') || ':' || coalesce(p.birth_date::text, '')
    end as identity_key,
    first_value(p.id) over (
      partition by p.household_id,
        case
          when p.linked_user_id is not null then 'linked:' || p.linked_user_id::text
          when nullif(lower(trim(coalesce(p.email, p.invite_email, ''))), '') is not null
            then 'email:' || lower(trim(coalesce(p.email, p.invite_email)))
          else 'person:' || lower(trim(coalesce(p.name, ''))) || ':' || coalesce(p.relationship, 'other') || ':' || coalesce(p.birth_date::text, '')
        end
      order by
        case when coalesce(p.account_status, '') = 'duplicate_merged' or p.active_until is not null then 1 else 0 end,
        case when p.linked_user_id is not null then 0 else 1 end,
        case when p.relationship in ('self', 'partner') then 0 else 1 end,
        p.created_at asc nulls last,
        p.id asc
    ) as canonical_id
  from public.people p
  where p.household_id is not null
    and trim(coalesce(p.name, '')) <> ''
), mapped as (
  select id as old_person_id, canonical_id
  from keyed
  where id <> canonical_id
)
select old_person_id, canonical_id
from mapped;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['pay_events', 'income_entries', 'student_loan_accounts'] loop
    if to_regclass(format('public.%I', table_name)) is not null
       and exists (
         select 1
         from information_schema.columns c
         where c.table_schema = 'public'
           and c.table_name = table_name
           and c.column_name = 'person_id'
       ) then
      execute format(
        'update public.%I r set person_id = m.canonical_id from pg_temp.loop_v2886_income_people_map m where r.person_id = m.old_person_id',
        table_name
      );
    end if;
  end loop;
end $$;

create index if not exists pay_events_person_effective_idx
  on public.pay_events(person_id, effective_from, effective_until);
create index if not exists income_entries_person_date_idx
  on public.income_entries(person_id, entry_date);
create index if not exists student_loan_accounts_person_balance_date_idx
  on public.student_loan_accounts(person_id, balance_date);

commit;
