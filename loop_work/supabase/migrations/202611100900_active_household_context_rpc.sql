-- One round trip for the household context every page needs (was four
-- sequential queries). SECURITY INVOKER: runs under the caller's RLS, so it
-- can only see what the four separate queries could.
create or replace function public.loop_active_household_context()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with me as (select (select auth.uid()) as uid),
  profile as (
    select p.household_id from public.app_user_profiles p, me where p.user_id = me.uid limit 1
  ),
  membership as (
    select m.household_id, m.role, m.permission_tier, m.can_manage_people, m.can_view_household_income
    from public.app_household_members m, me
    where m.user_id = me.uid and m.status = 'active'
    order by (m.household_id = (select household_id from profile)) desc nulls last, m.created_at asc
    limit 1
  ),
  household as (
    select h.id, h.name, h.owner_user_id
    from public.app_households h
    where h.id = (select household_id from membership) and h.status <> 'deleted'
  )
  select jsonb_build_object(
    'membership', (select to_jsonb(membership) from membership),
    'household', (select to_jsonb(household) from household),
    'member_user_ids', coalesce((
      select jsonb_agg(distinct m.user_id)
      from public.app_household_members m
      where m.household_id = (select id from household) and m.status = 'active'
    ), '[]'::jsonb)
  );
$$;

grant execute on function public.loop_active_household_context() to authenticated;
