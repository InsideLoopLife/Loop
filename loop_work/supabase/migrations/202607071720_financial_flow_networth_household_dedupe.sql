-- v28.66 Financial Flow + Net Worth household guardrails
-- Keeps people chips unique and prevents invite notifications from reappearing for households the user already belongs to.

alter table if exists public.people
  add column if not exists account_status text default 'managed_by_household',
  add column if not exists active_until date;

-- One-time cleanup for adult duplicate household profiles such as two "Beth" chips.
with ranked as (
  select
    id,
    row_number() over (
      partition by household_id, lower(trim(name)), relationship
      order by
        case when linked_user_id is not null then 0 else 1 end,
        case when coalesce(account_status, '') in ('linked', 'linked_data_claimed') then 0 else 1 end,
        created_at asc,
        id asc
    ) as rn
  from public.people
  where household_id is not null
    and active_until is null
    and coalesce(account_status, '') <> 'duplicate_merged'
    and coalesce(relationship, 'other') in ('self', 'partner', 'other')
    and nullif(trim(name), '') is not null
)
update public.people p
set account_status = 'duplicate_merged',
    active_until = coalesce(p.active_until, current_date),
    notes = concat_ws(E'\n', nullif(p.notes, ''), 'Auto-merged duplicate household person profile by v28.66.'),
    updated_at = now()
from ranked r
where p.id = r.id
  and r.rn > 1;

-- One-time cleanup for duplicate child profiles; birth date is included when present.
with ranked as (
  select
    id,
    row_number() over (
      partition by household_id, lower(trim(name)), coalesce(birth_date, date '1900-01-01')
      order by created_at asc, id asc
    ) as rn
  from public.people
  where household_id is not null
    and active_until is null
    and coalesce(account_status, '') <> 'duplicate_merged'
    and coalesce(relationship, '') = 'child'
    and nullif(trim(name), '') is not null
)
update public.people p
set account_status = 'duplicate_merged',
    active_until = coalesce(p.active_until, current_date),
    notes = concat_ws(E'\n', nullif(p.notes, ''), 'Auto-merged duplicate child household profile by v28.66.'),
    updated_at = now()
from ranked r
where p.id = r.id
  and r.rn > 1;

-- Keep the duplicate from coming back at DB level for active adult profiles.
create unique index if not exists people_household_active_adult_identity_uidx
on public.people (household_id, lower(trim(name)), relationship)
where household_id is not null
  and active_until is null
  and coalesce(account_status, '') <> 'duplicate_merged'
  and coalesce(relationship, 'other') in ('self', 'partner', 'other')
  and nullif(trim(name), '') is not null;

create unique index if not exists people_household_active_child_identity_uidx
on public.people (household_id, lower(trim(name)), coalesce(birth_date, date '1900-01-01'))
where household_id is not null
  and active_until is null
  and coalesce(account_status, '') <> 'duplicate_merged'
  and coalesce(relationship, '') = 'child'
  and nullif(trim(name), '') is not null;

create or replace function public.app_cleanup_household_invite_state(p_user_id uuid default auth.uid())
returns integer
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_count integer := 0;
begin
  if p_user_id is null then
    return 0;
  end if;

  update public.app_notifications n
  set status = 'dismissed',
      action_status = 'not_applicable',
      read_at = coalesce(n.read_at, now())
  where n.user_id = p_user_id
    and n.notification_type = 'household_invite'
    and coalesce(n.status, '') <> 'dismissed'
    and exists (
      select 1
      from public.app_household_members m
      where m.user_id = p_user_id
        and m.household_id = n.household_id
        and m.status = 'active'
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.app_cleanup_household_invite_state(uuid) to authenticated;

-- Apply cleanup immediately for all currently-active members.
update public.app_notifications n
set status = 'dismissed',
    action_status = 'not_applicable',
    read_at = coalesce(n.read_at, now())
where n.notification_type = 'household_invite'
  and coalesce(n.status, '') <> 'dismissed'
  and exists (
    select 1
    from public.app_household_members m
    where m.user_id = n.user_id
      and m.household_id = n.household_id
      and m.status = 'active'
  );
