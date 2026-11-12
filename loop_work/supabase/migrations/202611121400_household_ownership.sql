-- Household ownership and sharing.
-- Applied 12 Nov 2026 (with lock_timeout, after a deadlock with live traffic on the first try).
--
-- What you add, you own. Each member chooses how their money is shared with
-- the rest of the household:
--   private – nobody else sees it
--   view    – it counts in household figures, only you change it (default)
--   edit    – Owners and Partners can change it too
-- Anything assigned to you (your person card) you can always see and change.
-- Children's costs can be changed by Owners, Partners and Parents unless the
-- person who added them keeps their money private.
-- Replaces several older, overlapping rules that let any member see and change
-- everything regardless of these choices.

alter table public.app_household_members
  add column if not exists share_level text not null default 'view';
do $$ begin
  alter table public.app_household_members
    add constraint app_household_members_share_level_check check (share_level in ('private', 'view', 'edit'));
exception when duplicate_object then null; end $$;

-- Whoever set the household up usually adds the shared household bills, so
-- their Partner can help keep them right.
update public.app_household_members set share_level = 'edit'
where coalesce(permission_tier, role) = 'owner' and share_level = 'view';

create or replace function public.loop_member_share(p_household uuid, p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(m.share_level, 'view')
  from public.app_household_members m
  where m.household_id = p_household and m.user_id = p_user and coalesce(m.status, 'active') = 'active'
  limit 1;
$$;

create or replace function public.loop_can_see(p_creator uuid, p_household uuid, p_scope text, p_person uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v uuid := auth.uid();
  linked uuid;
  sl text;
begin
  if v is null then return false; end if;
  if p_creator = v then return true; end if;
  if p_person is not null then
    select p.linked_user_id into linked from public.people p where p.id = p_person;
    if linked = v then return true; end if;
  end if;
  if p_household is null or coalesce(p_scope, 'private') <> 'household' then return false; end if;
  if not exists (
    select 1 from public.app_household_members m
    where m.household_id = p_household and m.user_id = v and coalesce(m.status, 'active') = 'active'
  ) then return false; end if;
  sl := public.loop_member_share(p_household, p_creator);
  return sl is not null and sl <> 'private';
end;
$$;

create or replace function public.loop_can_change(p_creator uuid, p_household uuid, p_scope text, p_person uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v uuid := auth.uid();
  linked uuid;
  rel text;
  tier text;
  sl text;
begin
  if v is null then return false; end if;
  if p_creator = v then return true; end if;
  if p_person is not null then
    select p.linked_user_id, p.relationship into linked, rel from public.people p where p.id = p_person;
    if linked = v then return true; end if;
  end if;
  if p_household is null or coalesce(p_scope, 'private') <> 'household' then return false; end if;
  select coalesce(m.permission_tier, m.role, 'member') into tier
  from public.app_household_members m
  where m.household_id = p_household and m.user_id = v and coalesce(m.status, 'active') = 'active'
  limit 1;
  if tier is null then return false; end if;
  sl := public.loop_member_share(p_household, p_creator);
  if sl is null or sl = 'private' then return false; end if;
  if rel = 'child' and tier in ('owner', 'admin', 'parent_admin', 'parent') then return true; end if;
  return sl = 'edit' and tier in ('owner', 'admin', 'parent_admin');
end;
$$;

grant execute on function public.loop_member_share(uuid, uuid) to authenticated;
grant execute on function public.loop_can_see(uuid, uuid, text, uuid) to authenticated;
grant execute on function public.loop_can_change(uuid, uuid, text, uuid) to authenticated;

-- One set of rules per money table, replacing all older ones.
do $$
declare
  t record;
  pol record;
  person_expr text;
begin
  for t in select * from (values
    ('planned_items', 'person_id'),
    ('pay_events', 'person_id'),
    ('income_entries', 'person_id'),
    ('spending_entries', 'person_id'),
    ('financial_accounts', 'owner_person_id'),
    ('investment_accounts', 'person_id'),
    ('pension_accounts', 'person_id'),
    ('student_loan_accounts', 'person_id'),
    ('savings_pots', 'person_id'),
    ('child_costs', 'child_id'),
    ('homes', null),
    ('home_mortgage_deals', null),
    ('home_valuation_sources', null),
    ('investment_holdings', null),
    ('pension_funds', null)
  ) as x(tbl, person_col) loop
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = t.tbl loop
      execute format('drop policy %I on public.%I', pol.policyname, t.tbl);
    end loop;
    person_expr := coalesce(quote_ident(t.person_col), 'null::uuid');
    execute format('alter table public.%I enable row level security', t.tbl);
    execute format('create policy loop_share_select on public.%I for select to authenticated using (public.loop_can_see(user_id, household_id, visibility_scope, %s))', t.tbl, person_expr);
    execute format('create policy loop_share_insert on public.%I for insert to authenticated with check (user_id = auth.uid() and (household_id is null or public.loop_is_active_household_member(household_id, auth.uid())))', t.tbl);
    execute format('create policy loop_share_update on public.%I for update to authenticated using (public.loop_can_change(user_id, household_id, visibility_scope, %s)) with check (public.loop_can_change(user_id, household_id, visibility_scope, %s))', t.tbl, person_expr, person_expr);
    execute format('create policy loop_share_delete on public.%I for delete to authenticated using (public.loop_can_change(user_id, household_id, visibility_scope, %s))', t.tbl, person_expr);
  end loop;
end $$;

-- Exact monthly pay (maternity, overtime) follows the pay it belongs to, so a
-- partner's household view includes it.
drop policy if exists "Users manage their own pay overrides" on public.pay_event_monthly_overrides;
drop policy if exists loop_share_select on public.pay_event_monthly_overrides;
drop policy if exists loop_share_write on public.pay_event_monthly_overrides;
create policy loop_share_select on public.pay_event_monthly_overrides for select to authenticated using (
  user_id = auth.uid() or exists (
    select 1 from public.pay_events pe
    where pe.id = pay_event_monthly_overrides.pay_event_id
      and public.loop_can_see(pe.user_id, pe.household_id, pe.visibility_scope, pe.person_id)
  )
);
create policy loop_share_write on public.pay_event_monthly_overrides for all to authenticated using (
  user_id = auth.uid() or exists (
    select 1 from public.pay_events pe
    where pe.id = pay_event_monthly_overrides.pay_event_id
      and public.loop_can_change(pe.user_id, pe.household_id, pe.visibility_scope, pe.person_id)
  )
) with check (user_id = auth.uid() or exists (
    select 1 from public.pay_events pe
    where pe.id = pay_event_monthly_overrides.pay_event_id
      and public.loop_can_change(pe.user_id, pe.household_id, pe.visibility_scope, pe.person_id)
));

-- Let each member set their own sharing level.
create or replace function public.app_set_my_share_level(p_household_id uuid, p_level text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_level not in ('private', 'view', 'edit') then raise exception 'Unknown sharing level'; end if;
  update public.app_household_members set share_level = p_level
  where household_id = p_household_id and user_id = auth.uid() and coalesce(status, 'active') = 'active';
  if not found then raise exception 'You are not in that household'; end if;
end;
$$;
grant execute on function public.app_set_my_share_level(uuid, text) to authenticated;
