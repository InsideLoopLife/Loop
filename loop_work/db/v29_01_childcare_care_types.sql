-- V29.01: Expand child_costs beyond nursery-only logic.
-- Adds a finer-grained `care_type` alongside the existing `cost_kind` bucket,
-- plus a `care_details` jsonb column that holds the type-specific answers
-- collected by the new sequential wizard (ChildCostWizard.tsx).
--
-- This is purely additive: existing rows, existing cost_kind values, and every
-- existing SELECT/insert path continue to work unchanged. Run this directly
-- in the Supabase SQL editor.

alter table public.child_costs
  add column if not exists care_type text,
  add column if not exists care_details jsonb not null default '{}'::jsonb;

-- Backfill care_type for existing rows from their current cost_kind, so old
-- nursery/activity/fixed rows immediately work with the new dispatch logic.
update public.child_costs
set care_type = cost_kind
where care_type is null;

alter table public.child_costs
  alter column care_type set not null;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'child_costs_care_type_check') then
    alter table public.child_costs drop constraint child_costs_care_type_check;
  end if;
  alter table public.child_costs add constraint child_costs_care_type_check
    check (care_type in (
      'fixed', 'nursery', 'activity',
      'childminder', 'breakfast_club', 'after_school_club', 'holiday_camp', 'nanny'
    ));

  -- Widen cost_kind so nanny costs have their own bucket for reporting/labels,
  -- while childminder/breakfast_club/after_school_club/holiday_camp keep
  -- reusing the existing 'nursery'/'activity' buckets (see mapCareTypeToCostKind
  -- in lib/calculations/childcareRegistry.ts) so existing dashboard rollups
  -- do not need to change.
  if exists (select 1 from pg_constraint where conname = 'child_costs_cost_kind_check') then
    alter table public.child_costs drop constraint child_costs_cost_kind_check;
  end if;
  alter table public.child_costs add constraint child_costs_cost_kind_check
    check (cost_kind in ('fixed', 'nursery', 'activity', 'nanny'));
end $$;

create index if not exists child_costs_care_type_idx on public.child_costs(care_type);

comment on column public.child_costs.care_type is
  'Specific care type driving the sequential wizard and calculator (see childcareRegistry.ts). More granular than cost_kind.';
comment on column public.child_costs.care_details is
  'Type-specific answers from the wizard (rates, days, holiday periods, funded hours, nanny share %, etc). Shape depends on care_type.';
