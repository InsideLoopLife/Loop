-- LOOP v27.93.1 person guardian merge hotfix
-- Run before the corrected v27.93 SQL if the first v27.93 run failed on person_guardians.

create extension if not exists pgcrypto;

alter table public.people add column if not exists active_until date;
alter table public.people add column if not exists notes text;
alter table public.people add column if not exists linked_user_id uuid;
alter table public.people add column if not exists email text;
alter table public.people add column if not exists invite_email text;
alter table public.people add column if not exists avatar_url text;
alter table public.home_owners add column if not exists ownership_percent numeric;

-- Rebuild the same duplicate map used by v27.93. Prefer household-owned canonical rows.
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

-- Clean constrained household ownership rows before person IDs are collapsed.
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
  end if;

  if to_regclass('public.person_guardians') is not null then
    -- Remove existing self guardian rows first.
    delete from public.person_guardians r
    where r.child_person_id = r.guardian_person_id;

    -- Remove rows that would become self-guardian rows or duplicate pairs after the person merge.
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
  end if;
end $$;
