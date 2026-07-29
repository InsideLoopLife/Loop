-- LOOP v27.92 household person dedupe + house affordability allocation fix
-- Run after v27.91.x. This is intentionally idempotent.

create extension if not exists pgcrypto;

alter table public.people add column if not exists active_until date;
alter table public.people add column if not exists notes text;
alter table public.people add column if not exists linked_user_id uuid;
alter table public.people add column if not exists email text;
alter table public.people add column if not exists avatar_url text;
alter table public.home_owners add column if not exists ownership_percent numeric;

-- Keep linked/claimed household people using the claimed account display name/avatar.
update public.people p
set
  name = coalesce(nullif(up.display_name, ''), nullif(up.full_name, ''), p.name),
  avatar_url = coalesce(nullif(up.avatar_url, ''), nullif(p.avatar_url, '')),
  linked_user_id = coalesce(p.linked_user_id, up.user_id),
  email = coalesce(nullif(p.email, ''), nullif(up.email, '')),
  updated_at = now()
from public.app_user_profiles up
where (
    p.linked_user_id = up.user_id
    or lower(coalesce(p.email, '')) = lower(coalesce(up.email, ''))
  )
  and coalesce(nullif(up.display_name, ''), nullif(up.full_name, ''), nullif(up.email, '')) is not null;

-- Build a cross-member merge map. This handles the exact duplicate shown in the UI:
-- one household-owner-owned representation row plus the claimed member's own self row.
drop table if exists pg_temp.loop_person_merge_map;
create temp table loop_person_merge_map on commit drop as
with household_member_users as (
  select distinct
    h.id as household_id,
    h.owner_user_id,
    m.user_id as member_user_id,
    lower(coalesce(au.email, m.email, up.email, '')) as member_email
  from public.app_households h
  join public.app_household_members m on m.household_id = h.id and coalesce(m.status, 'active') = 'active'
  left join auth.users au on au.id = m.user_id
  left join public.app_user_profiles up on up.user_id = m.user_id
  where h.owner_user_id is not null
), household_people as (
  select
    hmu.household_id,
    hmu.owner_user_id,
    p.id,
    p.user_id,
    p.linked_user_id,
    lower(coalesce(p.email, '')) as email,
    p.relationship,
    case
      when nullif(lower(coalesce(p.email, '')), '') is not null then 'email:' || lower(p.email)
      when p.linked_user_id is not null then 'linked:' || p.linked_user_id::text
      else 'row:' || p.id::text
    end as identity_key,
    row_number() over (
      partition by hmu.household_id,
        case
          when nullif(lower(coalesce(p.email, '')), '') is not null then 'email:' || lower(p.email)
          when p.linked_user_id is not null then 'linked:' || p.linked_user_id::text
          else 'row:' || p.id::text
        end
      order by
        case when p.user_id = hmu.owner_user_id then 0 else 1 end,
        case when p.linked_user_id is not null then 0 else 1 end,
        case when p.relationship = 'self' then 0 when p.relationship = 'partner' then 1 else 2 end,
        p.updated_at desc nulls last,
        p.created_at desc nulls last,
        p.id
    ) as rn,
    first_value(p.id) over (
      partition by hmu.household_id,
        case
          when nullif(lower(coalesce(p.email, '')), '') is not null then 'email:' || lower(p.email)
          when p.linked_user_id is not null then 'linked:' || p.linked_user_id::text
          else 'row:' || p.id::text
        end
      order by
        case when p.user_id = hmu.owner_user_id then 0 else 1 end,
        case when p.linked_user_id is not null then 0 else 1 end,
        case when p.relationship = 'self' then 0 when p.relationship = 'partner' then 1 else 2 end,
        p.updated_at desc nulls last,
        p.created_at desc nulls last,
        p.id
    ) as canonical_id
  from household_member_users hmu
  join public.people p on p.user_id in (
    select m2.user_id from public.app_household_members m2 where m2.household_id = hmu.household_id and coalesce(m2.status, 'active') = 'active'
    union select hmu.owner_user_id
  )
  where p.active_until is null
    and (
      p.linked_user_id = hmu.member_user_id
      or (hmu.member_email <> '' and lower(coalesce(p.email, '')) = hmu.member_email)
      or p.user_id = hmu.member_user_id
    )
)
select id as duplicate_id, canonical_id
from household_people
where rn > 1 and id <> canonical_id;

-- Move references onto the canonical household row before hiding duplicates.
do $$
begin
  if to_regclass('public.home_owners') is not null then
    update public.home_owners r set person_id = m.canonical_id from pg_temp.loop_person_merge_map m where r.person_id = m.duplicate_id;
  end if;
  if to_regclass('public.pay_events') is not null then
    update public.pay_events r set person_id = m.canonical_id from pg_temp.loop_person_merge_map m where r.person_id = m.duplicate_id;
  end if;
  if to_regclass('public.income_entries') is not null then
    update public.income_entries r set person_id = m.canonical_id from pg_temp.loop_person_merge_map m where r.person_id = m.duplicate_id;
  end if;
  if to_regclass('public.planned_items') is not null then
    update public.planned_items r set person_id = m.canonical_id from pg_temp.loop_person_merge_map m where r.person_id = m.duplicate_id;
  end if;
  if to_regclass('public.spending_entries') is not null then
    update public.spending_entries r set person_id = m.canonical_id from pg_temp.loop_person_merge_map m where r.person_id = m.duplicate_id;
  end if;
  if to_regclass('public.student_loan_accounts') is not null then
    update public.student_loan_accounts r set person_id = m.canonical_id from pg_temp.loop_person_merge_map m where r.person_id = m.duplicate_id;
  end if;
  if to_regclass('public.child_costs') is not null then
    update public.child_costs r set child_id = m.canonical_id from pg_temp.loop_person_merge_map m where r.child_id = m.duplicate_id;
  end if;
  if to_regclass('public.person_guardians') is not null then
    update public.person_guardians r set child_person_id = m.canonical_id from pg_temp.loop_person_merge_map m where r.child_person_id = m.duplicate_id;
    update public.person_guardians r set guardian_person_id = m.canonical_id from pg_temp.loop_person_merge_map m where r.guardian_person_id = m.duplicate_id;
  end if;
end $$;

-- Collapse duplicate owner rows after remapping.
with ranked as (
  select id, row_number() over (partition by user_id, home_id, person_id order by created_at desc nulls last, id) as rn
  from public.home_owners
)
delete from public.home_owners h using ranked r where h.id = r.id and r.rn > 1;

-- Hide duplicate people after references have moved.
update public.people p
set active_until = current_date,
    notes = concat(coalesce(p.notes, ''), case when coalesce(p.notes, '') = '' then '' else ' | ' end, 'Auto-archived duplicate claimed household row by v27.92'),
    updated_at = now()
from pg_temp.loop_person_merge_map m
where p.id = m.duplicate_id
  and p.active_until is null;

-- Ensure no two active household-owner rows remain for the same linked account/email.
with ranked as (
  select
    p.id,
    row_number() over (
      partition by p.user_id, coalesce('email:' || nullif(lower(coalesce(p.email, '')), ''), 'linked:' || p.linked_user_id::text, 'id:' || p.id::text)
      order by case when p.linked_user_id is not null then 0 else 1 end, p.updated_at desc nulls last, p.created_at desc nulls last, p.id
    ) as rn
  from public.people p
  where p.active_until is null
)
update public.people p
set active_until = current_date,
    notes = concat(coalesce(p.notes, ''), case when coalesce(p.notes, '') = '' then '' else ' | ' end, 'Auto-archived duplicate owner-side person row by v27.92'),
    updated_at = now()
from ranked r
where p.id = r.id and r.rn > 1;
