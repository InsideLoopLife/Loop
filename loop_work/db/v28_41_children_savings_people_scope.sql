-- v28.41 - restore child profiles and make savings accounts person-owned with optional household visibility

-- 1) Restore child/dependant people that were incorrectly auto-archived by the v27.93 duplicate repair.
--    This is safe: it only restores a previously archived child when no active child with the same
--    household/name/birth date already exists.
with archived_children as (
  select p.id
  from public.people p
  where lower(coalesce(p.relationship, '')) = 'child'
    and p.active_until is not null
    and coalesce(p.notes, '') ilike '%Auto-archived duplicate household identity by v27.93%'
    and not exists (
      select 1
      from public.people active
      where active.id <> p.id
        and active.household_id is not distinct from p.household_id
        and lower(coalesce(active.relationship, '')) = 'child'
        and lower(coalesce(active.name, '')) = lower(coalesce(p.name, ''))
        and active.birth_date is not distinct from p.birth_date
        and active.active_until is null
        and coalesce(active.account_status, '') <> 'duplicate_merged'
    )
)
update public.people p
set active_until = null,
    account_status = case when p.account_status = 'duplicate_merged' then 'managed_by_household' else coalesce(p.account_status, 'managed_by_household') end,
    household_visibility = coalesce(p.household_visibility, 'household_summary'),
    income_visibility = coalesce(p.income_visibility, 'household_summary'),
    cost_visibility = coalesce(p.cost_visibility, 'household_editable'),
    income_visible_to_household = coalesce(p.income_visible_to_household, true),
    costs_visible_to_household = coalesce(p.costs_visible_to_household, true),
    household_can_add_costs = coalesce(p.household_can_add_costs, true),
    notes = trim(both ' |' from concat_ws(' | ', nullif(p.notes, ''), 'Restored active child profile by v28.41 household repair')),
    updated_at = now()
where p.id in (select id from archived_children);

-- 2) Add proper ownership fields to financial/savings accounts.
alter table if exists public.financial_accounts
  add column if not exists owner_user_id uuid,
  add column if not exists created_by_user_id uuid,
  add column if not exists household_id uuid,
  add column if not exists visibility_scope text default 'private',
  add column if not exists owner_person_id uuid,
  add column if not exists ownership_scope text default 'personal',
  add column if not exists savings_limit_scope text default 'individual';

-- 3) Attach foreign key for owner_person_id if missing.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'people')
     and not exists (select 1 from pg_constraint where conname = 'financial_accounts_owner_person_id_fkey') then
    alter table public.financial_accounts
      add constraint financial_accounts_owner_person_id_fkey
      foreign key (owner_person_id)
      references public.people(id)
      on delete set null;
  end if;
exception when duplicate_object then null;
end $$;

-- 4) Normalise ownership/visibility values without overwriting deliberately private/household rows.
update public.financial_accounts
set owner_user_id = coalesce(owner_user_id, user_id),
    created_by_user_id = coalesce(created_by_user_id, user_id),
    visibility_scope = case
      when visibility_scope in ('private', 'household') then visibility_scope
      when household_id is not null then 'household'
      else 'private'
    end,
    ownership_scope = case
      when ownership_scope in ('personal', 'joint', 'household', 'child') then ownership_scope
      when household_id is not null then 'personal'
      else 'personal'
    end,
    savings_limit_scope = case
      when savings_limit_scope in ('individual', 'joint', 'household', 'child') then savings_limit_scope
      else 'individual'
    end
where is_liability = false;

-- 5) Backfill owner_person_id for existing savings/cash accounts from the matching active household person.
with ranked_people as (
  select
    p.*,
    row_number() over (
      partition by p.household_id, coalesce(p.linked_user_id, p.user_id)
      order by
        case when p.relationship = 'self' then 0 when p.relationship = 'partner' then 1 else 2 end,
        p.created_at asc
    ) as rn
  from public.people p
  where p.active_until is null
    and coalesce(p.account_status, '') <> 'duplicate_merged'
    and coalesce(p.linked_user_id, p.user_id) is not null
)
update public.financial_accounts fa
set owner_person_id = rp.id,
    ownership_scope = case when fa.ownership_scope is null or fa.ownership_scope = 'household' then 'personal' else fa.ownership_scope end,
    savings_limit_scope = coalesce(fa.savings_limit_scope, 'individual'),
    updated_at = now()
from ranked_people rp
where rp.rn = 1
  and fa.is_liability = false
  and fa.owner_person_id is null
  and fa.user_id = coalesce(rp.linked_user_id, rp.user_id)
  and (fa.household_id is null or fa.household_id is not distinct from rp.household_id);

-- 6) If a savings account is explicitly a child savings account and has an owner_person_id child,
--    make the allowance scope child. Existing explicit values are preserved.
update public.financial_accounts fa
set ownership_scope = 'child',
    savings_limit_scope = 'child',
    updated_at = now()
from public.people p
where fa.owner_person_id = p.id
  and lower(coalesce(p.relationship, '')) = 'child'
  and fa.is_liability = false
  and (fa.ownership_scope is null or fa.ownership_scope in ('personal', 'child'));

create index if not exists financial_accounts_owner_person_id_idx on public.financial_accounts(owner_person_id);
create index if not exists financial_accounts_household_visibility_idx on public.financial_accounts(household_id, visibility_scope);
create index if not exists financial_accounts_ownership_scope_idx on public.financial_accounts(ownership_scope, savings_limit_scope);
