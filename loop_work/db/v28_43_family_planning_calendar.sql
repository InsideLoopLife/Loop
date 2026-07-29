-- v28.43 Family planning calendar
-- Adds a no-AI household family-planning calendar for school/nursery holidays,
-- annual leave allowances and cover planning.

create extension if not exists pgcrypto;

create table if not exists public.family_calendar_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  owner_user_id uuid,
  created_by_user_id uuid,
  household_id uuid references public.app_households(id) on delete cascade,
  visibility_scope text not null default 'household',

  label text not null default 'School calendar',
  source_type text not null default 'manual', -- manual, local_authority, school_website, ics, csv, nursery
  source_url text,
  local_authority text,
  school_name text,
  academic_year text,
  notes text,
  active boolean not null default true,

  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.family_calendar_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  owner_user_id uuid,
  created_by_user_id uuid,
  household_id uuid references public.app_households(id) on delete cascade,
  visibility_scope text not null default 'household',

  child_person_id uuid references public.people(id) on delete cascade,
  source_id uuid references public.family_calendar_sources(id) on delete set null,

  period_type text not null default 'school_holiday', -- school_holiday, nursery_closed, inset_day, bank_holiday, term_time, holiday_club, other
  label text not null default 'Holiday period',
  start_date date not null,
  end_date date not null,
  requires_cover boolean not null default true,
  expected_cost numeric not null default 0,
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint family_calendar_periods_date_order_chk check (end_date >= start_date)
);

create table if not exists public.family_leave_allowances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  owner_user_id uuid,
  created_by_user_id uuid,
  household_id uuid references public.app_households(id) on delete cascade,
  visibility_scope text not null default 'household',

  person_id uuid references public.people(id) on delete cascade,
  leave_year integer not null default extract(year from now())::integer,
  allowance_days numeric not null default 25,
  carried_over_days numeric not null default 0,
  bank_holidays_included boolean not null default false,
  work_pattern text not null default 'Mon-Fri',
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop index if exists public.family_leave_allowances_household_person_year_uidx;
create unique index family_leave_allowances_household_person_year_uidx
on public.family_leave_allowances (household_id, person_id, leave_year);

create table if not exists public.family_cover_policies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  owner_user_id uuid,
  created_by_user_id uuid,
  household_id uuid references public.app_households(id) on delete cascade,
  visibility_scope text not null default 'household',

  child_person_id uuid references public.people(id) on delete cascade,
  label text not null default 'Holiday cover policy',
  policy_type text not null default 'one_adult_weekdays',
  requires_adult_cover boolean not null default true,
  applies_weekends boolean not null default false,
  default_cover_type text not null default 'parent_leave',
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.family_cover_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  owner_user_id uuid,
  created_by_user_id uuid,
  household_id uuid references public.app_households(id) on delete cascade,
  visibility_scope text not null default 'household',

  child_person_id uuid references public.people(id) on delete cascade,
  cover_date date not null,
  cover_type text not null default 'parent_leave', -- parent_leave, working_from_home, holiday_club, nursery, family_cover, grandparent, unpaid_leave, uncovered, other
  person_id uuid references public.people(id) on delete set null,
  uses_leave_days numeric not null default 1,
  cost_estimate numeric not null default 0,
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists family_calendar_sources_household_idx
on public.family_calendar_sources (household_id, active, created_at desc);

create index if not exists family_calendar_periods_household_dates_idx
on public.family_calendar_periods (household_id, start_date, end_date);

create index if not exists family_calendar_periods_child_dates_idx
on public.family_calendar_periods (child_person_id, start_date, end_date);

create index if not exists family_cover_assignments_household_date_idx
on public.family_cover_assignments (household_id, cover_date);

create index if not exists family_cover_assignments_child_date_idx
on public.family_cover_assignments (child_person_id, cover_date);

create index if not exists family_leave_allowances_household_year_idx
on public.family_leave_allowances (household_id, leave_year);

-- Updated-at helper scoped to these tables only.
create or replace function public.loop_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_family_calendar_sources_updated_at on public.family_calendar_sources;
create trigger trg_family_calendar_sources_updated_at
before update on public.family_calendar_sources
for each row execute function public.loop_touch_updated_at();

drop trigger if exists trg_family_calendar_periods_updated_at on public.family_calendar_periods;
create trigger trg_family_calendar_periods_updated_at
before update on public.family_calendar_periods
for each row execute function public.loop_touch_updated_at();

drop trigger if exists trg_family_leave_allowances_updated_at on public.family_leave_allowances;
create trigger trg_family_leave_allowances_updated_at
before update on public.family_leave_allowances
for each row execute function public.loop_touch_updated_at();

drop trigger if exists trg_family_cover_policies_updated_at on public.family_cover_policies;
create trigger trg_family_cover_policies_updated_at
before update on public.family_cover_policies
for each row execute function public.loop_touch_updated_at();

drop trigger if exists trg_family_cover_assignments_updated_at on public.family_cover_assignments;
create trigger trg_family_cover_assignments_updated_at
before update on public.family_cover_assignments
for each row execute function public.loop_touch_updated_at();

-- RLS: user-owned rows and active household members can access household rows.
alter table public.family_calendar_sources enable row level security;
alter table public.family_calendar_periods enable row level security;
alter table public.family_leave_allowances enable row level security;
alter table public.family_cover_policies enable row level security;
alter table public.family_cover_assignments enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'family_calendar_sources' and policyname = 'family_calendar_sources_household_access') then
    create policy family_calendar_sources_household_access on public.family_calendar_sources
    for all using (
      auth.uid() = user_id
      or auth.uid() = created_by_user_id
      or exists (
        select 1 from public.app_household_members hm
        where hm.household_id = family_calendar_sources.household_id
          and hm.user_id = auth.uid()
          and hm.status = 'active'
      )
    ) with check (
      auth.uid() = user_id
      or auth.uid() = created_by_user_id
      or exists (
        select 1 from public.app_household_members hm
        where hm.household_id = family_calendar_sources.household_id
          and hm.user_id = auth.uid()
          and hm.status = 'active'
      )
    );
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'family_calendar_periods' and policyname = 'family_calendar_periods_household_access') then
    create policy family_calendar_periods_household_access on public.family_calendar_periods
    for all using (
      auth.uid() = user_id
      or auth.uid() = created_by_user_id
      or exists (
        select 1 from public.app_household_members hm
        where hm.household_id = family_calendar_periods.household_id
          and hm.user_id = auth.uid()
          and hm.status = 'active'
      )
    ) with check (
      auth.uid() = user_id
      or auth.uid() = created_by_user_id
      or exists (
        select 1 from public.app_household_members hm
        where hm.household_id = family_calendar_periods.household_id
          and hm.user_id = auth.uid()
          and hm.status = 'active'
      )
    );
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'family_leave_allowances' and policyname = 'family_leave_allowances_household_access') then
    create policy family_leave_allowances_household_access on public.family_leave_allowances
    for all using (
      auth.uid() = user_id
      or auth.uid() = created_by_user_id
      or exists (
        select 1 from public.app_household_members hm
        where hm.household_id = family_leave_allowances.household_id
          and hm.user_id = auth.uid()
          and hm.status = 'active'
      )
    ) with check (
      auth.uid() = user_id
      or auth.uid() = created_by_user_id
      or exists (
        select 1 from public.app_household_members hm
        where hm.household_id = family_leave_allowances.household_id
          and hm.user_id = auth.uid()
          and hm.status = 'active'
      )
    );
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'family_cover_policies' and policyname = 'family_cover_policies_household_access') then
    create policy family_cover_policies_household_access on public.family_cover_policies
    for all using (
      auth.uid() = user_id
      or auth.uid() = created_by_user_id
      or exists (
        select 1 from public.app_household_members hm
        where hm.household_id = family_cover_policies.household_id
          and hm.user_id = auth.uid()
          and hm.status = 'active'
      )
    ) with check (
      auth.uid() = user_id
      or auth.uid() = created_by_user_id
      or exists (
        select 1 from public.app_household_members hm
        where hm.household_id = family_cover_policies.household_id
          and hm.user_id = auth.uid()
          and hm.status = 'active'
      )
    );
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'family_cover_assignments' and policyname = 'family_cover_assignments_household_access') then
    create policy family_cover_assignments_household_access on public.family_cover_assignments
    for all using (
      auth.uid() = user_id
      or auth.uid() = created_by_user_id
      or exists (
        select 1 from public.app_household_members hm
        where hm.household_id = family_cover_assignments.household_id
          and hm.user_id = auth.uid()
          and hm.status = 'active'
      )
    ) with check (
      auth.uid() = user_id
      or auth.uid() = created_by_user_id
      or exists (
        select 1 from public.app_household_members hm
        where hm.household_id = family_cover_assignments.household_id
          and hm.user_id = auth.uid()
          and hm.status = 'active'
      )
    );
  end if;
end $$;

-- Backfill one default policy for active child rows so the page has sensible defaults.
insert into public.family_cover_policies (
  user_id,
  owner_user_id,
  created_by_user_id,
  household_id,
  visibility_scope,
  child_person_id,
  label,
  policy_type,
  requires_adult_cover,
  applies_weekends,
  default_cover_type,
  notes
)
select
  p.user_id,
  coalesce(p.owner_user_id, p.user_id),
  coalesce(p.created_by_user_id, p.owner_user_id, p.user_id),
  p.household_id,
  coalesce(p.visibility_scope, 'household'),
  p.id,
  concat(p.name, ' holiday cover'),
  'one_adult_weekdays',
  true,
  false,
  'parent_leave',
  'Default policy created by v28.43. Update this in Lifestyle > Family planning.'
from public.people p
where lower(coalesce(p.relationship, '')) = 'child'
  and p.household_id is not null
  and (p.active_until is null or p.active_until >= current_date)
  and not exists (
    select 1 from public.family_cover_policies fp
    where fp.child_person_id = p.id
      and fp.household_id = p.household_id
  );
