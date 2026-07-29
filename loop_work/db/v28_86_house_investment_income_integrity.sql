-- LOOP v28.86 combined migration
-- Run as one script in the Supabase SQL editor.

begin;

create table if not exists public.home_mortgage_liability_allocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  owner_user_id uuid references auth.users(id) on delete set null,
  created_by_user_id uuid references auth.users(id) on delete set null,
  household_id uuid references public.app_households(id) on delete cascade,
  visibility_scope text not null default 'private' check (visibility_scope in ('private','household')),
  home_mortgage_deal_id uuid not null references public.home_mortgage_deals(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  liability_percent numeric(7,4) not null default 0 check (liability_percent >= 0 and liability_percent <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(home_mortgage_deal_id, person_id)
);

create index if not exists home_mortgage_liability_deal_idx
  on public.home_mortgage_liability_allocations(home_mortgage_deal_id);
create index if not exists home_mortgage_liability_household_idx
  on public.home_mortgage_liability_allocations(household_id);

create table if not exists public.mortgage_deal_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  home_id uuid references public.homes(id) on delete cascade,
  source_kind text not null check (source_kind in ('market','recommendation')),
  source_id uuid not null,
  is_shortlisted boolean not null default false,
  is_starred boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, source_kind, source_id)
);

create index if not exists mortgage_deal_preferences_user_idx
  on public.mortgage_deal_preferences(user_id, home_id);
create unique index if not exists mortgage_deal_preferences_one_star_per_home_idx
  on public.mortgage_deal_preferences(user_id, coalesce(home_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where is_starred = true;

create table if not exists public.mortgage_workspace_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  moving_home_label text not null default 'Moving home',
  moving_home_description text not null default 'Saved searches and move costs',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(moving_home_label) between 1 and 40),
  check (char_length(moving_home_description) between 1 and 120)
);

alter table public.home_mortgage_liability_allocations enable row level security;
alter table public.mortgage_deal_preferences enable row level security;
alter table public.mortgage_workspace_preferences enable row level security;

drop policy if exists home_mortgage_liability_read on public.home_mortgage_liability_allocations;
create policy home_mortgage_liability_read on public.home_mortgage_liability_allocations
for select to authenticated
using (
  user_id = auth.uid()
  or (
    visibility_scope = 'household'
    and household_id is not null
    and exists (
      select 1 from public.app_household_members m
      where m.household_id = home_mortgage_liability_allocations.household_id
        and m.user_id = auth.uid()
        and coalesce(m.status, 'active') = 'active'
    )
  )
);

drop policy if exists home_mortgage_liability_insert on public.home_mortgage_liability_allocations;
create policy home_mortgage_liability_insert on public.home_mortgage_liability_allocations
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists home_mortgage_liability_update on public.home_mortgage_liability_allocations;
create policy home_mortgage_liability_update on public.home_mortgage_liability_allocations
for update to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.app_household_members m
    where m.household_id = home_mortgage_liability_allocations.household_id
      and m.user_id = auth.uid()
      and coalesce(m.status, 'active') = 'active'
      and coalesce(m.permission_tier, 'member') in ('owner','admin','parent','parent_admin')
  )
)
with check (
  user_id = auth.uid()
  or exists (
    select 1 from public.app_household_members m
    where m.household_id = home_mortgage_liability_allocations.household_id
      and m.user_id = auth.uid()
      and coalesce(m.status, 'active') = 'active'
      and coalesce(m.permission_tier, 'member') in ('owner','admin','parent','parent_admin')
  )
);

drop policy if exists home_mortgage_liability_delete on public.home_mortgage_liability_allocations;
create policy home_mortgage_liability_delete on public.home_mortgage_liability_allocations
for delete to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.app_household_members m
    where m.household_id = home_mortgage_liability_allocations.household_id
      and m.user_id = auth.uid()
      and coalesce(m.status, 'active') = 'active'
      and coalesce(m.permission_tier, 'member') in ('owner','admin','parent','parent_admin')
  )
);

drop policy if exists mortgage_deal_preferences_owner on public.mortgage_deal_preferences;
create policy mortgage_deal_preferences_owner on public.mortgage_deal_preferences
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists mortgage_workspace_preferences_owner on public.mortgage_workspace_preferences;
create policy mortgage_workspace_preferences_owner on public.mortgage_workspace_preferences
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

commit;

begin;

alter table public.investment_price_snapshots
  add column if not exists snapshot_batch_id uuid;

create index if not exists investment_price_snapshots_user_batch_idx
  on public.investment_price_snapshots(user_id, snapshot_batch_id, snapshot_at)
  where snapshot_batch_id is not null;

comment on column public.investment_price_snapshots.snapshot_batch_id is
  'Identifies every holding snapshot written during the same portfolio refresh. Account charts must aggregate complete batches rather than individual ticker timestamps.';

commit;

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
