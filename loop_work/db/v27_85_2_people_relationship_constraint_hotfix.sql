-- v27.85.2 - People relationship constraint hotfix
-- Fixes v27.85 failing when household member role = parent.
-- public.people.relationship only allows: self, partner, child, other.
-- Household permission roles such as parent/admin/owner must not be written into
-- the people.relationship field.

do $$
begin
  if to_regclass('public.people') is not null
     and to_regclass('public.app_household_members') is not null
     and to_regclass('public.app_households') is not null then
    insert into public.people(user_id, name, relationship, email, linked_user_id)
    select distinct
      h.owner_user_id,
      coalesce(nullif(split_part(au.email, '@', 1), ''), 'Household member') as name,
      case
        when lower(coalesce(m.role, '')) = 'child' then 'child'
        when lower(coalesce(m.role, '')) in ('partner', 'parent', 'owner', 'admin', 'adult', 'member') then 'partner'
        else 'other'
      end as relationship,
      au.email,
      m.user_id
    from public.app_household_members m
    join public.app_households h on h.id = m.household_id
    left join auth.users au on au.id = m.user_id
    where coalesce(m.status, 'active') = 'active'
      and m.user_id is not null
      and h.owner_user_id is not null
      and m.user_id <> h.owner_user_id
      and not exists (
        select 1
        from public.people p
        where p.user_id = h.owner_user_id
          and (
            p.linked_user_id = m.user_id
            or (au.email is not null and lower(coalesce(p.email, '')) = lower(au.email))
          )
      );
  end if;
end $$;

create or replace function public.app_repair_household_people_links()
returns integer
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_count integer := 0;
begin
  if auth.uid() is null then
    return 0;
  end if;

  insert into public.people(user_id, name, relationship, email, linked_user_id)
  select distinct
    h.owner_user_id,
    coalesce(nullif(split_part(au.email, '@', 1), ''), 'Household member') as name,
    case
      when lower(coalesce(m.role, '')) = 'child' then 'child'
      when lower(coalesce(m.role, '')) in ('partner', 'parent', 'owner', 'admin', 'adult', 'member') then 'partner'
      else 'other'
    end as relationship,
    au.email,
    m.user_id
  from public.app_household_members mine
  join public.app_households h on h.id = mine.household_id
  join public.app_household_members m on m.household_id = mine.household_id and coalesce(m.status, 'active') = 'active'
  left join auth.users au on au.id = m.user_id
  where mine.user_id = auth.uid()
    and coalesce(mine.status, 'active') = 'active'
    and m.user_id is not null
    and h.owner_user_id is not null
    and m.user_id <> h.owner_user_id
    and not exists (
      select 1 from public.people p
      where p.user_id = h.owner_user_id
        and (p.linked_user_id = m.user_id or (au.email is not null and lower(coalesce(p.email, '')) = lower(au.email)))
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.app_repair_household_people_links() to authenticated;
