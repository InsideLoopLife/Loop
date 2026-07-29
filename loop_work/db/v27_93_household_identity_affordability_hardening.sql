-- LOOP v27.93 household identity + affordability hardening
-- Run after v27.92. Idempotent.

create extension if not exists pgcrypto;

alter table public.people add column if not exists active_until date;
alter table public.people add column if not exists notes text;
alter table public.people add column if not exists linked_user_id uuid;
alter table public.people add column if not exists email text;
alter table public.people add column if not exists invite_email text;
alter table public.people add column if not exists avatar_url text;
alter table public.home_owners add column if not exists ownership_percent numeric;

-- Fill missing linked account/email/name fields from the claimed user profile, using both email and invite_email.
update public.people p
set
  linked_user_id = coalesce(p.linked_user_id, up.user_id),
  email = coalesce(nullif(p.email, ''), nullif(up.email, '')),
  name = coalesce(nullif(up.display_name, ''), nullif(up.full_name, ''), nullif(p.name, ''), split_part(up.email, '@', 1)),
  avatar_url = coalesce(nullif(p.avatar_url, ''), nullif(up.avatar_url, '')),
  account_status = coalesce(nullif(p.account_status, ''), 'linked'),
  updated_at = now()
from public.app_user_profiles up
where p.active_until is null
  and (
    p.linked_user_id = up.user_id
    or lower(coalesce(p.email, '')) = lower(coalesce(up.email, ''))
    or lower(coalesce(p.invite_email, '')) = lower(coalesce(up.email, ''))
  );

-- Build a robust duplicate map. Prefer the household-owner canonical row where possible.
drop table if exists pg_temp.loop_v2793_person_merge_map;
create temp table loop_v2793_person_merge_map on commit drop as
with active_households as (
  select h.id as household_id, h.owner_user_id
  from public.app_households h
  where h.owner_user_id is not null and coalesce(h.status, 'active') <> 'deleted'
), member_accounts as (
  select distinct
    ah.household_id,
    ah.owner_user_id,
    m.user_id as member_user_id,
    lower(coalesce(au.email, up.email, m.email, '')) as member_email
  from active_households ah
  join public.app_household_members m on m.household_id = ah.household_id and coalesce(m.status, 'active') = 'active'
  left join auth.users au on au.id = m.user_id
  left join public.app_user_profiles up on up.user_id = m.user_id
  where m.user_id is not null
), scoped_people as (
  select
    ma.household_id,
    ma.owner_user_id,
    p.id,
    p.user_id,
    p.linked_user_id,
    lower(coalesce(p.email, p.invite_email, '')) as row_email,
    p.relationship,
    coalesce(p.linked_user_id::text, ma.member_user_id::text, 'email:' || lower(coalesce(p.email, p.invite_email, '')), p.id::text) as resolved_key,
    case
      when p.user_id = ma.owner_user_id and p.linked_user_id is not null then 0
      when p.user_id = ma.owner_user_id then 1
      when p.relationship = 'self' then 2
      else 3
    end as rank_score,
    p.updated_at,
    p.created_at
  from member_accounts ma
  join public.people p on p.active_until is null
   and (
    p.user_id = ma.owner_user_id
    or p.user_id = ma.member_user_id
    or p.linked_user_id = ma.member_user_id
    or (ma.member_email <> '' and lower(coalesce(p.email, p.invite_email, '')) = ma.member_email)
   )
  where (
    p.linked_user_id = ma.member_user_id
    or p.user_id = ma.member_user_id
    or (ma.member_email <> '' and lower(coalesce(p.email, p.invite_email, '')) = ma.member_email)
  )
), ranked as (
  select
    *,
    first_value(id) over (partition by household_id, resolved_key order by rank_score, updated_at desc nulls last, created_at desc nulls last, id) as canonical_id,
    row_number() over (partition by household_id, resolved_key order by rank_score, updated_at desc nulls last, created_at desc nulls last, id) as rn
  from scoped_people
)
select id as duplicate_id, canonical_id
from ranked
where rn > 1 and id <> canonical_id;

-- Move references from duplicate person rows onto the canonical household person.
-- v27.93.1: de-duplicate constrained tables before updating IDs, otherwise
-- Postgres can raise unique violations when two rows collapse to the same pair.
do $$
begin
  if to_regclass('public.home_owners') is not null then
    with desired as (
      select
        ho.ctid as row_ctid,
        ho.user_id,
        ho.home_id,
        coalesce(m.canonical_id, ho.person_id) as new_person_id,
        row_number() over (
          partition by ho.user_id, ho.home_id, coalesce(m.canonical_id, ho.person_id)
          order by ho.ctid::text
        ) as rn
      from public.home_owners ho
      left join pg_temp.loop_v2793_person_merge_map m on ho.person_id = m.duplicate_id
    )
    delete from public.home_owners ho
    using desired d
    where ho.ctid = d.row_ctid
      and d.rn > 1;

    update public.home_owners r
    set person_id = m.canonical_id
    from pg_temp.loop_v2793_person_merge_map m
    where r.person_id = m.duplicate_id;
  end if;

  if to_regclass('public.pay_events') is not null then
    update public.pay_events r set person_id = m.canonical_id from pg_temp.loop_v2793_person_merge_map m where r.person_id = m.duplicate_id;
  end if;
  if to_regclass('public.income_entries') is not null then
    update public.income_entries r set person_id = m.canonical_id from pg_temp.loop_v2793_person_merge_map m where r.person_id = m.duplicate_id;
  end if;
  if to_regclass('public.planned_items') is not null then
    update public.planned_items r set person_id = m.canonical_id from pg_temp.loop_v2793_person_merge_map m where r.person_id = m.duplicate_id;
  end if;
  if to_regclass('public.spending_entries') is not null then
    update public.spending_entries r set person_id = m.canonical_id from pg_temp.loop_v2793_person_merge_map m where r.person_id = m.duplicate_id;
  end if;
  if to_regclass('public.student_loan_accounts') is not null then
    update public.student_loan_accounts r set person_id = m.canonical_id from pg_temp.loop_v2793_person_merge_map m where r.person_id = m.duplicate_id;
  end if;
  if to_regclass('public.child_costs') is not null then
    update public.child_costs r set child_id = m.canonical_id from pg_temp.loop_v2793_person_merge_map m where r.child_id = m.duplicate_id;
  end if;

  if to_regclass('public.person_guardians') is not null then
    -- Delete rows that would become self-guardian rows or duplicate child/guardian pairs after merge.
    with desired as (
      select
        r.ctid as row_ctid,
        coalesce(child_map.canonical_id, r.child_person_id) as new_child_person_id,
        coalesce(guardian_map.canonical_id, r.guardian_person_id) as new_guardian_person_id,
        row_number() over (
          partition by
            coalesce(child_map.canonical_id, r.child_person_id),
            coalesce(guardian_map.canonical_id, r.guardian_person_id)
          order by r.ctid::text
        ) as rn
      from public.person_guardians r
      left join pg_temp.loop_v2793_person_merge_map child_map on r.child_person_id = child_map.duplicate_id
      left join pg_temp.loop_v2793_person_merge_map guardian_map on r.guardian_person_id = guardian_map.duplicate_id
    )
    delete from public.person_guardians r
    using desired d
    where r.ctid = d.row_ctid
      and (
        d.new_child_person_id = d.new_guardian_person_id
        or d.rn > 1
      );

    with desired as (
      select
        r.ctid as row_ctid,
        coalesce(child_map.canonical_id, r.child_person_id) as new_child_person_id,
        coalesce(guardian_map.canonical_id, r.guardian_person_id) as new_guardian_person_id
      from public.person_guardians r
      left join pg_temp.loop_v2793_person_merge_map child_map on r.child_person_id = child_map.duplicate_id
      left join pg_temp.loop_v2793_person_merge_map guardian_map on r.guardian_person_id = guardian_map.duplicate_id
    )
    update public.person_guardians r
    set
      child_person_id = d.new_child_person_id,
      guardian_person_id = d.new_guardian_person_id
    from desired d
    where r.ctid = d.row_ctid
      and d.new_child_person_id <> d.new_guardian_person_id
      and (
        r.child_person_id is distinct from d.new_child_person_id
        or r.guardian_person_id is distinct from d.new_guardian_person_id
      );
  end if;
end $$;

-- Collapse duplicate owners after remapping. Keep latest percent if duplicates exist.
with ranked as (
  select id, row_number() over (partition by user_id, home_id, person_id order by created_at desc nulls last, id) as rn
  from public.home_owners
)
delete from public.home_owners h using ranked r where h.id = r.id and r.rn > 1;

-- Archive duplicates after references move.
update public.people p
set active_until = current_date,
    notes = concat(coalesce(p.notes, ''), case when coalesce(p.notes, '') = '' then '' else ' | ' end, 'Auto-archived duplicate household identity by v27.93'),
    updated_at = now()
from pg_temp.loop_v2793_person_merge_map m
where p.id = m.duplicate_id
  and p.active_until is null;

-- If owner percentages are missing for multi-owner homes, auto-split them equally.
with owner_counts as (
  select user_id, home_id, count(*) as owner_count
  from public.home_owners
  group by user_id, home_id
)
update public.home_owners ho
set ownership_percent = round((100.0 / nullif(oc.owner_count, 0))::numeric, 2)
from owner_counts oc
where ho.user_id = oc.user_id
  and ho.home_id = oc.home_id
  and oc.owner_count > 0
  and ho.ownership_percent is null;
